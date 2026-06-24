import type { ReactNode } from 'react'
import { cx } from '../admin/cx'
import styles from './PageHeader.module.css'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** right-aligned action slot (buttons). */
  actions?: ReactNode
  /** small uppercase eyebrow above the title. */
  eyebrow?: ReactNode
  size?: 'page' | 'section'
  /** heading level; defaults to h1 for page, h2 for section. */
  as?: 'h1' | 'h2'
  align?: 'start' | 'center'
  className?: string
}

/**
 * One unified header scale shared across customer + admin surfaces, replacing the
 * drifting 2rem / 1.8rem / 1.3rem ad-hoc headings.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  size = 'page',
  as,
  align = 'start',
  className,
}: PageHeaderProps) {
  const Heading = as ?? (size === 'page' ? 'h1' : 'h2')
  return (
    <header className={cx(styles.header, styles[size], align === 'center' && styles.center, className)}>
      <div className={styles.texts}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <Heading className={styles.title}>{title}</Heading>
        {description && <p className={styles.desc}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
