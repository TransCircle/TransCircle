import { useId, useRef, type KeyboardEvent } from 'react'
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
  // useId 前缀：同页多个 Tabs 实例（或相同 key）不会撞出重复 DOM id。
  const baseId = useId()
  // roving tabindex：选中项可聚焦；value 不匹配任何项时兜底首项，
  // 否则所有 tab 都是 -1、整个 tablist 掉出 Tab 序列，键盘无法进入。
  const selectedIndex = items.findIndex((t) => t.key === value)
  const rovingIndex = selectedIndex >= 0 ? selectedIndex : 0

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
            id={`${baseId}-tab-${item.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            /* 未传 panelId 时不输出 aria-controls，避免指向不存在的元素。 */
            aria-controls={panelId}
            tabIndex={i === rovingIndex ? 0 : -1}
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
