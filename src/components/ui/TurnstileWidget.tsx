import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { useTheme } from "../../context/ThemeContext";
import styles from "./TurnstileWidget.module.css";

export interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  /** 命令式句柄：调用方在提交之后用它重新挑战（见 TurnstileWidgetHandle）。 */
  ref?: Ref<TurnstileWidgetHandle>;
}

export interface TurnstileWidgetHandle {
  /**
   * 作废当前令牌并重新挑战。
   *
   * 令牌是**一次性**的：只要随请求发给了后端，无论那次请求成功与否都已被消费。
   * 登录失败后不重置的话，表单里留着的是一枚已经作废的令牌，
   * 用户重试只会收到「验证码已过期」—— 看起来像是验证码自己坏了。
   */
  reset: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          /** "flexible"：宽度撑满容器（下限 300px），与表单控件等宽。 */
          size?: "normal" | "flexible" | "compact";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

/**
 * Cloudflare Turnstile widget wrapper.
 *
 * - Lazy-loads the Turnstile script on first mount (shared across instances).
 * - Returns null when `VITE_TURNSTILE_SITE_KEY` is unset (dev fallback).
 * - Exposes the rendered widget ID via `data-turnstile-widget` attribute on the
 *   container div, so callers can call `window.turnstile.reset(...)` externally.
 * - Follows the page theme (ThemeContext) instead of `theme: "auto"` — auto only
 *   tracks the OS colour scheme and would not react to a manual theme toggle.
 *   On theme change the old widget is removed and re-rendered.
 */
export const TurnstileWidget = ({ onToken, onError, onExpire, ref }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  /** 当前 widget id：reset() 要用，且必须随主题重渲染而更新。 */
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const { theme } = useTheme();

  // Keep the latest callbacks in refs so the render effect never re-runs when
  // the parent passes inline arrow functions that change every render.
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  }, [onToken, onError, onExpire]);

  // ── Lazy-load the Turnstile script ──────────────────────────────────
  useEffect(() => {
    if (!SITE_KEY) return;

    let cancelled = false;
    const onLoad = () => {
      if (!cancelled) setScriptReady(true);
    };

    // Already loaded by a previous mount or another copy of this component.
    if (window.turnstile) {
      setScriptReady(true);
      return;
    }

    // Script tag already exists in <head> but hasn't finished loading.
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]',
    );

    if (existing) {
      existing.addEventListener("load", onLoad);
      return () => {
        existing.removeEventListener("load", onLoad);
      };
    }

    // First mount – create the script tag.
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = onLoad;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [SITE_KEY]);

  // ── Render the Turnstile widget ─────────────────────────────────────
  useEffect(() => {
    if (!scriptReady || !SITE_KEY || !containerRef.current || !window.turnstile) return;

    const el = containerRef.current;
    // render 是第三方脚本的同步调用,配置不被认、容器状态异常时会直接抛。
    // effect 里抛出去会被错误边界接走 —— 整张登录表单换成错误页,
    // 而人机验证只是表单里的一个部件。这里兜住:最坏情况是没有验证码,
    // 提交时后端会要求验证码并由 onError/CAPTCHA_REQUIRED 给出可见反馈。
    let widgetId: string;
    try {
      widgetId = window.turnstile.render(el, {
        sitekey: SITE_KEY,
        // 默认的 normal 是固定 300px 宽，比表单控件窄一截，看着像没对齐；
        // flexible 让 widget 撑满容器宽度（高度仍是 65px，与 .slot 预留一致）。
        size: "flexible",
        callback: (token: string) => {
          onTokenRef.current(token);
        },
        "error-callback": () => {
          onErrorRef.current?.();
        },
        "expired-callback": () => {
          onExpireRef.current?.();
        },
        theme,
      });
    } catch {
      onErrorRef.current?.();
      return;
    }

    // Expose the widget ID so callers can call window.turnstile.reset().
    el.dataset.turnstileWidget = widgetId;
    widgetIdRef.current = widgetId;

    return () => {
      widgetIdRef.current = null;
      if (window.turnstile) {
        try {
          // Destroy the old widget on unmount/theme change: a mere reset would
          // leave the old iframe in the container and the re-render would stack
          // a second widget on top of it.
          window.turnstile.remove(widgetId);
        } catch {
          // Widget was already removed from the DOM – nothing to remove.
        }
      }
    };
  }, [scriptReady, theme]);

  const reset = useCallback(() => {
    // 脚本还没落地 / 已卸载时是 no-op：此时页面上根本没有待作废的令牌。
    if (!widgetIdRef.current || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
    } catch {
      // widget 已被移除（如主题切换的竞态）：下一次 render 会带来全新的挑战。
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  if (!SITE_KEY) return null;

  // 外层 .slot 预留 widget 的标准尺寸，避免脚本落地时整页抖一下（见样式文件）。
  // 预留放在**外层**而不是挂载点上：turnstile.render() 会重写挂载点的 class
  // （渲染后它的 class 变成空串），预留的高度会跟着一起消失 ——
  // 主题切换要先 remove 再 render，中间那一帧就会塌下去闪一下。
  return (
    <div className={styles.slot}>
      <div ref={containerRef} />
    </div>
  );
};
