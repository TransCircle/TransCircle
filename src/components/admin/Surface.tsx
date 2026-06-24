import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Surface.module.css'

/* ── Card / Panel ────────────────────────────────────────── */

export interface CardProps {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md'
  tone?: 'surface' | 'subtle'
  accent?: boolean
  className?: string
}

export function Card({ children, padding = 'md', tone = 'surface', accent, className }: CardProps) {
  return (
    <div
      className={cx(
        styles.card,
        tone === 'subtle' ? styles.subtle : styles.surface,
        padding === 'md' && styles.padMd,
        padding === 'sm' && styles.padSm,
        accent && styles.accent,
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ── SectionLabel ────────────────────────────────────────── */

export interface SectionLabelProps {
  children: ReactNode
  className?: string
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return <h3 className={cx(styles.sectionLabel, className)}>{children}</h3>
}

/* ── Toolbar ─────────────────────────────────────────────── */

export interface ToolbarProps {
  children: ReactNode
  justify?: 'start' | 'between' | 'end'
  className?: string
}

export function Toolbar({ children, justify = 'start', className }: ToolbarProps) {
  return (
    <div
      className={cx(
        styles.toolbar,
        justify === 'between' && styles.justifyBetween,
        justify === 'end' && styles.justifyEnd,
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ── DescriptionList ─────────────────────────────────────── */

export interface DescriptionItem {
  term: string
  value: ReactNode
}

export interface DescriptionListProps {
  items: DescriptionItem[]
  columns?: 1 | 2
}

export function DescriptionList({ items, columns = 2 }: DescriptionListProps) {
  return (
    <dl className={cx(styles.dl, columns === 2 && styles.dlTwoCol)}>
      {items.map((it, i) => (
        <div key={i} className={styles.dlRow}>
          <dt className={styles.dt}>{it.term}</dt>
          <dd className={styles.dd}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── VoteProgress ────────────────────────────────────────── */

export interface VoteProgressProps {
  approve: number
  reject: number
  required: number
  total: number
  approveLabel: string
  rejectLabel: string
  thresholdLabel: string
}

export function VoteProgress({
  approve,
  reject,
  required,
  total,
  approveLabel,
  rejectLabel,
  thresholdLabel,
}: VoteProgressProps) {
  const denom = Math.max(required, total, 1)
  const approvePct = Math.min((approve / denom) * 100, 100)
  const rejectPct = Math.min((reject / denom) * 100, 100 - approvePct)
  const thresholdPct = Math.min((required / denom) * 100, 100)
  return (
    <div className={styles.vote}>
      <div
        className={styles.voteTrack}
        role="progressbar"
        aria-valuenow={approve}
        aria-valuemin={0}
        aria-valuemax={required}
        aria-label={`${approveLabel} ${approve} / ${required}`}
      >
        <span className={styles.voteApprove} style={{ width: `${approvePct}%` }} />
        <span className={styles.voteReject} style={{ width: `${rejectPct}%` }} />
        {required > 0 && required <= denom && (
          <span className={styles.voteThreshold} style={{ left: `${thresholdPct}%` }} aria-hidden="true" />
        )}
      </div>
      <div className={styles.voteLegend}>
        <span className={styles.voteStat}>
          <span className={cx(styles.voteDot, styles.voteDotApprove)} aria-hidden="true" />
          {approveLabel} {approve}
        </span>
        <span className={styles.voteStat}>
          <span className={cx(styles.voteDot, styles.voteDotReject)} aria-hidden="true" />
          {rejectLabel} {reject}
        </span>
        <span className={styles.voteThresholdLabel}>
          {thresholdLabel} {required}
        </span>
      </div>
    </div>
  )
}
