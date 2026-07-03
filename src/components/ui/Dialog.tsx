import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cx } from "../admin/cx";
import { AdminButton } from "../admin/AdminButton";
import { Alert } from "../admin/Feedback";
import styles from "./Dialog.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* 模块级模态栈:叠层(如表单弹窗上再弹 step-up)时只有栈顶实例响应 Esc 与 Tab 焦点陷阱。 */
const dialogStack: symbol[] = [];
const isTop = (id: symbol) => dialogStack[dialogStack.length - 1] === id;

/* body 滚动锁的引用计数:叠层时只有「第一层打开」锁定并记录原值、「最后一层关闭」复原。 */
let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";
const lockBody = () => {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  lockCount += 1;
};
const unlockBody = () => {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
};

/* 退场动画兜底延时(≥ CSS 最长 transition:移动端底部抽屉 260ms)。 */
const EXIT_MS = 280;
/* 移动端底部抽屉断点(与 Dialog.module.css 的 @media 保持一致)。 */
const SHEET_QUERY = "(max-width: 560px)";

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (nodes.length === 0) {
    e.preventDefault();
    return;
  }
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** 标题左侧的装饰图标(可选,通常配合 tone 使用)。 */
  icon?: ReactNode;
  tone?: "default" | "danger";
  size?: "sm" | "md" | "lg";
  /** 背景点击是否可关闭。默认 false —— 企业级默认:防误触丢失输入;false 时点背景只做「脉冲」提示。 */
  dismissOnBackdrop?: boolean;
  /** Esc 是否可关闭。默认 true。 */
  dismissOnEsc?: boolean;
  /** 异步进行中:屏蔽一切关闭(X / Esc / 背景 / 下拉),避免提交途中被关。 */
  busy?: boolean;
  /** 是否显示右上角关闭按钮。默认 true。 */
  showClose?: boolean;
  /** 打开后初始聚焦的元素(缺省聚焦面板内首个可聚焦元素)。 */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * 全站账户中心统一弹窗:Portal + 进出场动效 + 焦点陷阱 + body 滚动锁(引用计数,叠层安全)+
 * 模态栈 + ARIA + 关闭后焦点还原。
 * - 头部(抓握条 + 标题 + 关闭 X)与页脚固定不动,仅正文区滚动,X 不随内容滑走。
 * - 正文右侧为自定义滚动条(圆角内、面板子元素、可拖动),原生滚动条隐藏。
 * - 移动端为底部抽屉:可从头部下拉关闭,未过阈值回弹(touch-action:none 确保手势不被误判为滚动)。
 * - 默认背景点击不可关闭(防误触);busy 期间一切关闭被拦截并以脉冲提示。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  icon,
  tone = "default",
  size = "sm",
  dismissOnBackdrop = false,
  dismissOnEsc = true,
  busy = false,
  showClose = true,
  initialFocusRef,
}: DialogProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const stackIdRef = useRef<symbol | null>(null);
  if (stackIdRef.current === null) stackIdRef.current = Symbol("dialog");
  const stackId = stackIdRef.current;
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;

  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const pulseTimer = useRef<number | null>(null);

  // presence:open=true → 挂载后下一帧切 visible 播放入场;open=false → 先切回隐藏播放退场,延时卸载。
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const tid = window.setTimeout(() => setMounted(false), reduced ? 0 : EXIT_MS);
    return () => window.clearTimeout(tid);
  }, [open]);

  // 重新打开时清掉上一轮下拉手势遗留的内联 transform/transition,避免面板停在屏外。
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.style.transform = "";
      panelRef.current.style.transition = "";
    }
  }, [open]);

  // 栈 + 滚动锁 + 焦点保存/还原:随「是否在 DOM 中(mounted)」进出。
  useEffect(() => {
    if (!mounted) return;
    dialogStack.push(stackId);
    restoreRef.current = document.activeElement as HTMLElement | null;
    lockBody();
    const raf = requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ??
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        panelRef.current;
      // preventScroll:单一滚动结构下,首个可聚焦元素可能是滚动流底部的页脚按钮,
      // 默认 focus 会把滚动区滚到底(标题/顶部内容被推走)。禁止聚焦时的自动滚动,保持从顶部开始。
      target?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      // 仅当本弹窗拆除时仍是栈顶才还原焦点:否则(其上已叠了新弹窗,如 step-up)会把焦点从新弹窗抢到背景触发器。
      const wasTop = isTop(stackId);
      const i = dialogStack.indexOf(stackId);
      if (i >= 0) dialogStack.splice(i, 1);
      unlockBody();
      if (wasTop) restoreRef.current?.focus?.();
    };
    // initialFocusRef 仅在打开时读取一次,刻意不入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, stackId]);

  useEffect(
    () => () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    },
    [],
  );

  const pulse = useCallback(() => {
    setPulsing(true);
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsing(false), 260);
  }, []);

  const requestClose = useCallback(() => {
    if (busy) {
      pulse();
      return;
    }
    onClose();
  }, [busy, onClose, pulse]);

  // Esc 关闭 + Tab 焦点陷阱(仅栈顶实例响应)。
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isTop(stackId)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        if (dismissOnEsc) requestClose();
        else pulse();
        return;
      }
      if (e.key === "Tab") trapFocus(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [mounted, stackId, dismissOnEsc, requestClose, pulse]);

  // ── 自定义滚动条:根据正文滚动/尺寸变化同步 thumb 高度与位置,原生滚动条隐藏。 ──
  const rafRef = useRef<number | null>(null);
  const syncScrollbar = useCallback(() => {
    const sc = scrollRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!sc || !thumb || !track) return;
    const { scrollTop, scrollHeight, clientHeight } = sc;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 1) {
      setScrollbarVisible(false);
      return;
    }
    setScrollbarVisible(true);
    const trackH = track.clientHeight;
    const thumbH = Math.max(28, (clientHeight / scrollHeight) * trackH);
    const maxTop = Math.max(0, trackH - thumbH);
    const top = overflow > 0 ? (scrollTop / overflow) * maxTop : 0;
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  const onScrollAreaScroll = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      syncScrollbar();
    });
  };

  useEffect(() => {
    if (!mounted) return;
    syncScrollbar();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncScrollbar()) : null;
    if (ro) {
      if (scrollRef.current) ro.observe(scrollRef.current);
      if (innerRef.current) ro.observe(innerRef.current);
    }
    return () => {
      ro?.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [mounted, syncScrollbar]);

  // 软键盘弹出时布局视口(dvh)不缩,弹窗页脚会被键盘遮住、焦点框滚上来后在狭小可见区里与按钮挤压重合。
  // 用 visualViewport 把遮罩对齐到"键盘之上的可见区"(对所有视口都生效:居中弹窗随之在可见区内重新居中,
  // 底部抽屉随之上移),配合面板 max-height:100%(相对遮罩),页脚始终完整可见可点。
  // 无键盘/无缩放时 vv 尺寸即布局视口,等价于 inset:0,无副作用;overlay 每次打开都是新元素,无残留内联样式。
  useEffect(() => {
    if (!mounted) return;
    const vv = window.visualViewport;
    const overlay = overlayRef.current;
    if (!vv || !overlay) return;
    const apply = () => {
      overlay.style.top = `${vv.offsetTop}px`;
      overlay.style.left = `${vv.offsetLeft}px`;
      overlay.style.width = `${vv.width}px`;
      overlay.style.height = `${vv.height}px`;
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [mounted]);

  // 滚动条 thumb 拖动:直接改 scrollTop,onScroll 再同步位置。
  const thumbDrag = useRef<{ startY: number; startScroll: number } | null>(null);
  const onThumbDown = (e: React.PointerEvent) => {
    const sc = scrollRef.current;
    if (!sc) return;
    e.preventDefault();
    e.stopPropagation();
    thumbDrag.current = { startY: e.clientY, startScroll: sc.scrollTop };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onThumbMove = (e: React.PointerEvent) => {
    const d = thumbDrag.current;
    const sc = scrollRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!d || !sc || !track || !thumb) return;
    const overflow = sc.scrollHeight - sc.clientHeight;
    const maxTop = Math.max(1, track.clientHeight - thumb.clientHeight);
    sc.scrollTop = d.startScroll + ((e.clientY - d.startY) / maxTop) * overflow;
  };
  const onThumbUp = (e: React.PointerEvent) => {
    thumbDrag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // ── 移动端下拉关闭手势:仅底部抽屉断点生效,过阈值关闭、否则回弹。 ──
  const drag = useRef<{ startY: number; active: boolean; height: number } | null>(null);
  const springTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (springTimer.current !== null) window.clearTimeout(springTimer.current);
    },
    [],
  );
  const onSheetPointerDown = (e: React.PointerEvent) => {
    if (!window.matchMedia?.(SHEET_QUERY).matches) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (busy) {
      pulse();
      return;
    }
    if (springTimer.current !== null) {
      window.clearTimeout(springTimer.current);
      springTimer.current = null;
    }
    drag.current = { startY: e.clientY, active: true, height: panel.getBoundingClientRect().height };
    panel.style.transition = "none";
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onSheetPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d?.active || !panel) return;
    const dy = Math.max(0, e.clientY - d.startY);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const onSheetPointerEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d?.active || !panel) return;
    d.active = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const dy = Math.max(0, e.clientY - d.startY);
    const threshold = Math.min(140, d.height * 0.28);
    // 内联 transition 会盖过 CSS 的 reduced-motion 规则,故此处手动尊重减少动效偏好。
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (dy > threshold && !busy) {
      // 滑到底再回调关闭,避免关闭瞬间位置跳变;减少动效时瞬时收起。
      panel.style.transition = reduced ? "none" : "transform 190ms var(--ease-standard)";
      panel.style.transform = `translateY(${d.height}px)`;
      springTimer.current = window.setTimeout(() => onClose(), reduced ? 0 : 180);
    } else if (reduced) {
      // 减少动效:立即复位,交还给 CSS。
      panel.style.transition = "";
      panel.style.transform = "";
    } else {
      // 回弹到原位,随后清掉内联样式交还给 CSS。
      panel.style.transition = "transform 220ms var(--ease-emphasized)";
      panel.style.transform = "translateY(0px)";
      springTimer.current = window.setTimeout(() => {
        if (panelRef.current) {
          panelRef.current.style.transition = "";
          panelRef.current.style.transform = "";
        }
      }, 230);
    }
  };

  if (!mounted) return null;

  const state = visible ? "open" : "closed";
  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      data-state={state}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (dismissOnBackdrop) requestClose();
        else pulse();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        data-state={state}
        data-pulse={pulsing || undefined}
        className={cx(styles.panel, styles[size], tone === "danger" && styles.danger)}
      >
        {/* 单一滚动区:头部(sticky)+ 正文 + 页脚同处一个可滚动流。高度不够时整块滚动、不挤压重叠。 */}
        <div ref={scrollRef} className={styles.scroll} onScroll={onScrollAreaScroll}>
          <div ref={innerRef} className={styles.content}>
            {/* 头部:sticky 吸顶,始终可见;含移动端抓握条,可下拉关闭。 */}
            <div
              className={styles.dragZone}
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerEnd}
              onPointerCancel={onSheetPointerEnd}
            >
              <span className={styles.grabber} aria-hidden="true" />
              <div className={styles.header}>
                {icon && (
                  <span className={cx(styles.icon, tone === "danger" && styles.iconDanger)} aria-hidden="true">
                    {icon}
                  </span>
                )}
                <div className={styles.heading}>
                  <h2 id={titleId} className={styles.title}>
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className={styles.desc}>
                      {description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {children && <div className={styles.body}>{children}</div>}
            {footer && <div className={styles.footer}>{footer}</div>}
          </div>
        </div>

        {/* 关闭 X:固定于面板右上角(在滚动区之外),不随内容滑动。 */}
        {showClose && (
          <button type="button" className={styles.closeBtn} aria-label={t("common.close")} onClick={requestClose}>
            <CloseIcon />
          </button>
        )}

        {/* 自定义滚动条:面板子元素(不随滚动),圆角内,可拖动。 */}
        <div ref={trackRef} className={styles.scrollbar} data-visible={scrollbarVisible || undefined} aria-hidden="true">
          <div
            ref={thumbRef}
            className={styles.thumb}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
  loading?: boolean;
  icon?: ReactNode;
  /** 弹窗内错误插槽:失败时就近显示、弹窗保持开启可直接重试。 */
  error?: ReactNode;
}

/**
 * 基于 Dialog 的确认框(替代 window.confirm)。危险操作默认聚焦「取消」。
 * loading 期间自动进入 busy 态并禁用两个按钮,拦截误关/重复提交。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  tone = "default",
  loading,
  icon,
  error,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      tone={tone}
      icon={icon}
      busy={loading}
      initialFocusRef={tone === "danger" ? cancelRef : undefined}
      footer={
        <>
          <AdminButton ref={cancelRef} variant="secondary" disabled={loading} onClick={onCancel}>
            {cancelText}
          </AdminButton>
          <AdminButton
            variant={tone === "danger" ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmText}
          </AdminButton>
        </>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Dialog>
  );
}
