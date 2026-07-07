import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'

/**
 * Locale-aware timestamp formatter.
 *
 * Renders a stable `YYYY/MM/DD HH:mm` shape via `Intl.DateTimeFormat`, keyed off
 * the active UI language so dates localize instead of being pinned
 * to a hardcoded locale. Replaces the per-page `formatTs` copies that previously
 * hardcoded `zh-CN` or rendered raw UTC ISO strings.
 *
 * @param ts     epoch milliseconds (number) or a numeric string; null/undefined → ''.
 * @param locale BCP-47 tag; defaults to the current `i18n.language`.
 * @param opts   `{ utc: true }` forces UTC display (audit fidelity); default is local time.
 */
export function formatTs(
  ts: number | string | null | undefined,
  locale?: string,
  opts?: { utc?: boolean },
): string {
  if (ts === null || ts === undefined || ts === '') return ''
  const n = typeof ts === 'string' ? Number(ts) : ts
  if (typeof n !== 'number' || Number.isNaN(n)) return String(ts)
  const lng = locale ?? i18n.language ?? 'zh-CN'
  return new Intl.DateTimeFormat(lng, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(opts?.utc ? { timeZone: 'UTC' } : {}),
  }).format(new Date(n))
}

/**
 * Hook variant: returns a formatter bound to the current UI language, so callers
 * inside components don't thread `locale` manually and output updates on language switch.
 */
export function useFormatTs() {
  const { i18n: instance } = useTranslation()
  return useCallback(
    (ts: number | string | null | undefined, opts?: { utc?: boolean }) =>
      formatTs(ts, instance.language, opts),
    [instance.language],
  )
}
