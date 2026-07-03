import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from './cx'
import styles from './Feedback.module.css'

/* ── Spinner ─────────────────────────────────────────────── */

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  /** 内联用于按钮等场景：仅渲染转圈，不创建独立的 live region。 */
  inline?: boolean
  label?: string
}

export function Spinner({ size = 'md', inline, label }: SpinnerProps) {
  const { t } = useTranslation()
  const ring = <span className={cx(styles.ring, styles[`ring_${size}`])} aria-hidden="true" />
  if (inline) return ring
  return (
    <span className={styles.spinner} role="status" aria-live="polite">
      {ring}
      {label ? (
        <span className={styles.spinnerLabel}>{label}</span>
      ) : (
        /* 不传 label 时给读屏器兜底文案：空的 status region 对读屏用户毫无信息。 */
        <span className={styles.srOnly}>{t('common.loading')}</span>
      )}
    </span>
  )
}

/* ── Alert ───────────────────────────────────────────────── */

export interface AlertProps {
  tone?: 'error' | 'success' | 'info'
  children: ReactNode
  className?: string
}

const alertIcon = (tone: 'error' | 'success' | 'info') => {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }
  if (tone === 'success') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.5 2.5 2.5 5-6" />
      </svg>
    )
  }
  if (tone === 'info') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="m10.29 3.86-8.18 14.14A2 2 0 0 0 3.84 21h16.32a2 2 0 0 0 1.73-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

export function Alert({ tone = 'error', children, className }: AlertProps) {
  return (
    <div
      className={cx(styles.alert, styles[`alert_${tone}`], className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={styles.alertIcon} aria-hidden="true">{alertIcon(tone)}</span>
      <div className={styles.alertBody}>{children}</div>
    </div>
  )
}

/* ── EmptyState ──────────────────────────────────────────── */

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <span className={styles.emptyIcon} aria-hidden="true">{icon}</span>}
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyDesc}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  )
}
