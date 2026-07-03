import type { ReactNode } from 'react'
import { cx } from '../admin/cx'
import { AdminButton, Spinner, type AdminButtonVariant } from '../admin'
import { CenteredCard } from './CenteredCard'
import { PageHeader } from './PageHeader'
import styles from './StatusScreen.module.css'

export type StatusKind = 'loading' | 'success' | 'error' | 'info'

export interface StatusAction {
  label: string
  /** react-router target — rendered as an AdminButton-styled internal Link. */
  to?: string
  /** external URL — rendered as an AdminButton-styled anchor. */
  href?: string
  onClick?: () => void
  variant?: AdminButtonVariant
  loading?: boolean
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

/**
 * Shared centered result screen (loading / success / error / info) used by auth,
 * status, and OAuth pages. Composes Spinner + PageHeader + AdminButton inside a
 * CenteredCard, with always-mounted live regions so kind transitions announce.
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
  const content = (
    <>
      {showIcon && (
        <span className={styles.icon} aria-hidden="true">
          {icon ?? (kind === 'loading' ? <Spinner size="lg" inline /> : ICONS[kind])}
        </span>
      )}
      {/* 窄卡片语境用 card 字号(1.4rem),避免 page 级 2rem 在 26rem 卡片里过大。 */}
      <PageHeader title={title} description={description} align="center" size="card" as="h1" className={styles.header} />
      {detail && <p className={styles.detail}>{detail}</p>}
      {actions && actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map((a, i) => {
            const variant = a.variant ?? (i === 0 ? 'primary' : 'secondary')
            // 导航动作交给 AdminButton 的链接形态(to=内部 / href=外链),
            // 与按钮共享同一套视觉,替代此前组件内的第三份按钮样式实现。
            if (a.to) {
              return (
                <AdminButton key={i} variant={variant} to={a.to}>
                  {a.label}
                </AdminButton>
              )
            }
            if (a.href) {
              return (
                <AdminButton key={i} variant={variant} href={a.href}>
                  {a.label}
                </AdminButton>
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
    </>
  )

  return (
    <CenteredCard maxWidth={maxWidth} as={as}>
      {/* 双常驻 live region:polite(loading/success/info)与 alert(error)自挂载起
          就在可访问性树中,kind 切换只替换其内部内容而非整棵树/属性,
          读屏才能可靠播报 loading→结果 的变化(动态换 role/aria-live 会丢播报)。 */}
      <div className={cx(styles.inner, styles[kind])}>
        <div role="status" aria-live="polite" className={styles.live}>
          {kind !== 'error' && content}
        </div>
        <div role="alert" className={styles.live}>
          {kind === 'error' && content}
        </div>
      </div>
    </CenteredCard>
  )
}
