import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'
import { AdminButton } from './AdminButton'
import { Alert } from './Feedback'
import { TextArea, TextField } from './Field'
import styles from './Modal.module.css'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* 模块级模态栈：叠层（如列表模态上再弹确认框）时只有栈顶实例响应
   Esc 与焦点陷阱，否则一次 Esc 会把所有层同时关掉。 */
const modalStack: symbol[] = []
const isTopModal = (id: symbol) => modalStack[modalStack.length - 1] === id

/* body 滚动锁的引用计数:叠层时只有「第一层打开」锁定并记录原值、「最后一层关闭」复原。
   若每个实例各自 capture/restore,两层同一次提交内一起关闭时,里层 cleanup 会把「外层仍锁定」
   时读到的 overflow:hidden/paddingRight 当作原值写回,导致 body 永久锁死并残留横向位移。 */
let bodyLockCount = 0
let savedBodyOverflow = ''
let savedBodyPaddingRight = ''

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
    // 仅第一层模态锁定 body 并记录原值;叠层不重复锁、不重复补偿。
    // 锁滚动会让文档滚动条消失、内容横向抖动；用等宽 padding 补偿。
    if (bodyLockCount === 0) {
      savedBodyOverflow = document.body.style.overflow
      savedBodyPaddingRight = document.body.style.paddingRight
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    bodyLockCount += 1

    const focusTarget =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      panelRef.current
    focusTarget?.focus()

    return () => {
      const i = modalStack.indexOf(stackId)
      if (i >= 0) modalStack.splice(i, 1)
      // 仅最后一层关闭时复原为「任何模态打开之前」的原值,与多层 cleanup 的执行顺序无关。
      bodyLockCount = Math.max(0, bodyLockCount - 1)
      if (bodyLockCount === 0) {
        document.body.style.overflow = savedBodyOverflow
        document.body.style.paddingRight = savedBodyPaddingRight
      }
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

/* ── ConfirmDialog (replaces window.confirm) ─────────────── */

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'default' | 'danger'
  confirmLoading?: boolean
  /** 弹窗内错误插槽：渲染在正文与页脚之间。失败时错误就近显示、
      弹窗保持开启可直接重试，而非关框后在被遮挡的页面顶部展示。 */
  error?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  variant = 'default',
  confirmLoading,
  error,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      size="sm"
      initialFocusRef={variant === 'danger' ? cancelRef : undefined}
      footer={
        <>
          <AdminButton ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelText}
          </AdminButton>
          <AdminButton
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={confirmLoading}
          >
            {confirmText}
          </AdminButton>
        </>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Modal>
  )
}

/* ── ReasonPromptDialog (replaces inline reason rows) ────── */

export interface ReasonPromptDialogProps {
  open: boolean
  title: string
  /** 输入框上方的说明段落（与 label 至少给一个，避免无标签输入框）。 */
  prompt?: string
  /** 输入框的字段标签（走 Field 的 label 排版，可与 required 星标组合）。 */
  label?: string
  required?: boolean
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  submitText: string
  cancelText: string
  maxLength: number
  /** 覆盖默认的「已输入 / 上限」字数计数 hint。 */
  counterText?: string
  /** 字段级校验错误：替换计数 hint 就近显示，并把输入框标红。 */
  fieldError?: string
  /** 弹窗内错误插槽（如接口错误）：渲染在输入区与页脚之间的 Alert，
      与 ConfirmDialog.error 同款——弹窗保持开启可修改后重试。 */
  error?: ReactNode
  variant?: 'default' | 'danger'
  submitting?: boolean
  /** true 时用多行 TextArea（Enter 换行，不再触发提交）。 */
  multiline?: boolean
  rows?: number
}

export function ReasonPromptDialog({
  open,
  title,
  prompt,
  label,
  required,
  placeholder,
  value,
  onChange,
  onSubmit,
  onCancel,
  submitText,
  cancelText,
  maxLength,
  counterText,
  fieldError,
  error,
  variant = 'default',
  submitting,
  multiline,
  rows = 4,
}: ReasonPromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // 校验失败时把焦点还给输入框，用户可立即修正（hint 自带 aria-live 播报）。
  useEffect(() => {
    if (open && fieldError) (multiline ? areaRef : inputRef).current?.focus()
  }, [open, fieldError, multiline])
  // 计数 hint：校验错误优先于计数展示（与 Field 的 hint/invalid 语义一致）。
  const hint = fieldError ?? counterText ?? `${value.length} / ${maxLength}`
  const fieldProps = {
    label,
    required,
    value,
    maxLength,
    placeholder,
    invalid: Boolean(fieldError),
    hint,
  }
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocusRef={multiline ? areaRef : inputRef}
      footer={
        <>
          <AdminButton variant="secondary" onClick={onCancel}>
            {cancelText}
          </AdminButton>
          <AdminButton
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onSubmit}
            loading={submitting}
          >
            {submitText}
          </AdminButton>
        </>
      }
    >
      {prompt && <p className={styles.prompt}>{prompt}</p>}
      {multiline ? (
        <TextArea
          ref={areaRef}
          rows={rows}
          {...fieldProps}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <TextField
          ref={inputRef}
          {...fieldProps}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
      )}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </Modal>
  )
}
