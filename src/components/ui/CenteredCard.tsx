import type { ReactNode } from 'react'
import { cx } from '../admin/cx'
import { Card } from '../admin'
import styles from './CenteredCard.module.css'

export interface CenteredCardProps {
  children: ReactNode
  /** max inline width of the card; defaults to var(--w-form) (~26rem). */
  maxWidth?: string
  padding?: 'sm' | 'md'
  /** outer landmark; use 'main' only when rendered outside RootLayout (e.g. error boundary). */
  as?: 'div' | 'main'
  /** className applied to the inner Card. */
  className?: string
}

/**
 * Vertically-centered Card on the page background — the shared "centered card"
 * treatment for auth and status/result pages. Renders a div by default (RootLayout
 * owns the page <main>); pass as="main" for routes rendered outside RootLayout.
 */
export function CenteredCard({ children, maxWidth, padding = 'md', as = 'div', className }: CenteredCardProps) {
  const Shell = as
  return (
    // data-viewport-fit：同 AuthSplit —— 状态屏/窄表单页只有一屏,
    // 宽屏下锁成整屏,页脚不随内容下移(见 RootLayout.module.css)。
    <Shell className={styles.shell} data-viewport-fit="">
      <div className={styles.holder} style={maxWidth ? { maxWidth } : undefined}>
        <Card padding={padding} className={cx(styles.card, className)}>
          <div className={styles.body}>{children}</div>
        </Card>
      </div>
    </Shell>
  )
}
