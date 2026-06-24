import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../admin/cx'
import { AdminButton, Spinner, type AdminButtonVariant } from '../admin'
import { CenteredCard } from './CenteredCard'
import { PageHeader } from './PageHeader'
import styles from './StatusScreen.module.css'

export type StatusKind = 'loading' | 'success' | 'error' | 'info'

export interface StatusAction {
  label: string
  /** react-router target — rendered as a Link styled like a button. */
  to?: string
  onClick?: () => void
  variant?: AdminButtonVariant
  loading?: boolean
}

export interface StatusScreenProps {
  kind: StatusKind
  title: string
  description?: ReactNode
  /** small monospace detail line (e.g. an error code). */
  detail?: string
  actions?: StatusAction[]
  icon?: ReactNode
  showIcon?: boolean
  maxWidth?: string
  /** use 'main' only when rendered outside RootLayout (router errorElement). */
  as?: 'div' | 'main'
}

const SuccessIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 3 3 5-6" />
  </svg>
)
const ErrorIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </svg>
)
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
)

const ICONS: Record<Exclude<StatusKind, 'loading'>, ReactNode> = {
  success: <SuccessIcon />,
  error: <ErrorIcon />,
  info: <InfoIcon />,
}

/**
 * Shared centered result screen (loading / success / error / info) used by auth,
 * status, and OAuth pages. Composes Spinner + PageHeader + AdminButton inside a
 * CenteredCard, with the correct live-region role per kind.
 */
export function StatusScreen({
  kind,
  title,
  description,
  detail,
  actions,
  icon,
  showIcon = true,
  maxWidth,
  as = 'div',
}: StatusScreenProps) {
  return (
    <CenteredCard maxWidth={maxWidth} as={as}>
      <div
        className={cx(styles.inner, styles[kind])}
        role={kind === 'error' ? 'alert' : 'status'}
        aria-live={kind === 'error' ? 'assertive' : 'polite'}
      >
        {showIcon && (
          <span className={styles.icon} aria-hidden="true">
            {icon ?? (kind === 'loading' ? <Spinner size="lg" inline /> : ICONS[kind])}
          </span>
        )}
        <PageHeader title={title} description={description} align="center" size="page" as="h1" className={styles.header} />
        {detail && <p className={styles.detail}>{detail}</p>}
        {actions && actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((a, i) => {
              const variant = a.variant ?? (i === 0 ? 'primary' : 'secondary')
              if (a.to) {
                return (
                  <Link key={i} to={a.to} className={cx(styles.linkBtn, variant === 'primary' ? styles.linkPrimary : styles.linkSecondary)}>
                    {a.label}
                  </Link>
                )
              }
              return (
                <AdminButton key={i} variant={variant} loading={a.loading} onClick={a.onClick}>
                  {a.label}
                </AdminButton>
              )
            })}
          </div>
        )}
      </div>
    </CenteredCard>
  )
}
