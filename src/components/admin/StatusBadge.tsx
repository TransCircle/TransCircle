import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './StatusBadge.module.css'

export type BadgeTone = 'neutral' | 'amber' | 'blue' | 'green' | 'red' | 'muted' | 'accent'

export interface StatusBadgeProps {
  tone: BadgeTone
  label: string
  size?: 'sm' | 'md'
}

/** 语义状态标签：圆点 + 文字（始终带文字，满足 WCAG 1.4.1 不依赖颜色）。 */
export function StatusBadge({ tone, label, size = 'md' }: StatusBadgeProps) {
  return (
    <span className={cx(styles.badge, styles[`tone_${tone}`], size === 'sm' && styles.sm)}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  )
}

export interface PillProps {
  children: ReactNode
  tone?: 'neutral' | 'accent'
}

/** 轻量中性标记（如分类、摘要片段）。 */
export function Pill({ children, tone = 'neutral' }: PillProps) {
  return <span className={cx(styles.pill, tone === 'accent' && styles.pillAccent)}>{children}</span>
}
