import { useEffect, useRef, useState } from "react";

import { useTheme } from "../../context/ThemeContext";

export interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
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
export const TurnstileWidget = ({ onToken, onError, onExpire }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
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
    const widgetId = window.turnstile.render(el, {
      sitekey: SITE_KEY,
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

    // Expose the widget ID so callers can call window.turnstile.reset().
    el.dataset.turnstileWidget = widgetId;

    return () => {
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

  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
};
