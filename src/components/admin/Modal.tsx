import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'
import { lockScroll } from '../../utils/scrollLock'
import styles from './Modal.module.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* 模块级模态栈：叠层（如列表模态上再弹确认框）时只有栈顶实例响应
   Esc 与焦点陷阱，否则一次 Esc 会把所有层同时关掉。 */
const modalStack: symbol[] = []
const isTopModal = (id: symbol) => modalStack[modalStack.length - 1] === id

/* 滚动锁的引用计数不在这里维护:见 utils/scrollLock —— 叠层(含与 ui/Dialog、导航抽屉
   跨家族叠层)时只有第一次上锁记录原值、最后一次解锁还原。若每层各自 capture/restore,
   里层 cleanup 会把「外层仍锁定」时读到的 overflow:hidden 当作原值写回,body 永久锁死。 */

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE)
  if (nodes.length === 0) {
    e.preventDefault()
    return
  }
  const first = nodes[0]!
  const last = nodes[nodes.length - 1]!
  const active = document.activeElement
  if (e.shiftKey) {
    if (active === first || !container.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else if (active === last) {
    e.preventDefault()
    first.focus()
  }
}

/* ── Modal base ──────────────────────────────────────────── */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
  closeOnOverlayClick?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'sm',
  closeOnOverlayClick = true,
  initialFocusRef,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const stackIdRef = useRef<symbol | null>(null)
  if (stackIdRef.current === null) stackIdRef.current = Symbol('modal')
  const stackId = stackIdRef.current
  const baseId = useId()
  const titleId = `${baseId}-title`
  const descId = `${baseId}-desc`

  useEffect(() => {
    if (!open) return
    modalStack.push(stackId)
    restoreRef.current = document.activeElement as HTMLElement | null
    // 滚动锁与 ui/Dialog、导航抽屉共用同一份计数(见 utils/scrollLock):
    // 各记各的话,跨家族叠层按非 LIFO 顺序关闭会提前解锁、甚至把 body 永久锁死。
    const releaseScroll = lockScroll()

    const focusTarget =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      panelRef.current
    focusTarget?.focus()

    return () => {
      const i = modalStack.indexOf(stackId)
      if (i >= 0) modalStack.splice(i, 1)
      // 仅最后一层关闭时复原为「任何弹层打开之前」的原值,与多层 cleanup 的执行顺序无关。
      releaseScroll()
      restoreRef.current?.focus?.()
    }
    // initialFocusRef is read once on open; intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // 非栈顶实例不响应：Esc 只关最上层，Tab 只陷在最上层面板内。
      if (!isTopModal(stackId)) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab') trapFocus(e, panelRef.current)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose, stackId])

  if (!open) return null

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cx(styles.panel, size === 'md' && styles.panelMd)}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description && (
          <p id={descId} className={styles.desc}>
            {description}
          </p>
        )}
        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
