import { useRef, type KeyboardEvent } from 'react'
import { cx } from './cx'
import styles from './Tabs.module.css'

export interface TabItem<K extends string = string> {
  key: K
  label: string
  badge?: number | string
}

export interface TabsProps<K extends string = string> {
  items: ReadonlyArray<TabItem<K>>
  value: K
  onChange: (key: K) => void
  ariaLabel: string
  variant?: 'underline' | 'segmented'
  /** 当所有标签共用单个 tabpanel 时传入其 id，避免 aria-controls 指向不存在的元素。 */
  panelId?: string
}

/** WAI-ARIA tablist：roving tabindex + 方向键/Home/End 导航。 */
export function Tabs<K extends string = string>({
  items,
  value,
  onChange,
  ariaLabel,
  variant = 'underline',
  panelId,
}: TabsProps<K>) {
  const refs = useRef<HTMLButtonElement[]>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next: number
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % items.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i - 1 + items.length) % items.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    const target = items[next]
    if (!target) return
    onChange(target.key)
    refs.current[next]?.focus()
  }

  return (
    <div
      className={cx(styles.tabs, variant === 'segmented' ? styles.segmented : styles.underline)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item, i) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            ref={(el) => {
              if (el) refs.current[i] = el
            }}
            id={`tab-${item.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={panelId ?? `tabpanel-${item.key}`}
            tabIndex={active ? 0 : -1}
            className={cx(styles.tab, active && styles.active)}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            <span className={styles.tabLabel}>{item.label}</span>
            {item.badge != null && <span className={styles.badge}>{item.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
