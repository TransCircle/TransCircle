import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../admin/cx'
import styles from './RadioGroup.module.css'

export interface RadioOption<V extends string = string> {
  value: V
  label: ReactNode
  hint?: string
  disabled?: boolean
}

export interface RadioGroupProps<V extends string = string> {
  label?: string
  ariaLabel?: string
  options: ReadonlyArray<RadioOption<V>>
  value: V | null
  onChange: (value: V) => void
  orientation?: 'vertical' | 'horizontal'
  invalid?: boolean
  className?: string
}

/**
 * Accessible radio group built on the ThemeToggle pattern: `role=radiogroup` with
 * roving tabindex + Arrow/Home/End navigation (selection follows focus). Replaces
 * native radio inputs with on-brand, labeled option rows.
 */
export function RadioGroup<V extends string = string>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  orientation = 'vertical',
  invalid,
  className,
}: RadioGroupProps<V>) {
  const refs = useRef<HTMLButtonElement[]>([])

  const findEnabled = (from: number, dir: 1 | -1): number => {
    const n = options.length
    for (let step = 0; step < n; step++) {
      const i = (from + dir * step + n * (step + 1)) % n
      if (!options[i]?.disabled) return i
    }
    return -1
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        next = findEnabled(index - 1, -1)
        break
      case 'ArrowDown':
      case 'ArrowRight':
        next = findEnabled(index + 1, 1)
        break
      case 'Home':
        next = findEnabled(0, 1)
        break
      case 'End':
        next = findEnabled(options.length - 1, -1)
        break
      default:
        return
    }
    e.preventDefault()
    const target = options[next]
    if (next === -1 || !target) return
    onChange(target.value)
    refs.current[next]?.focus()
  }

  const activeIndex = options.findIndex((o) => o.value === value)
  const focusableIndex = activeIndex >= 0 ? activeIndex : options.findIndex((o) => !o.disabled)

  return (
    <div className={cx(styles.field, className)}>
      {label && <span className={styles.label}>{label}</span>}
      <div
        className={cx(styles.group, orientation === 'horizontal' && styles.horizontal)}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-orientation={orientation}
        aria-invalid={invalid || undefined}
      >
        {options.map((o, i) => {
          const checked = o.value === value
          return (
            <button
              key={o.value}
              ref={(el) => {
                if (el) refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={o.disabled}
              tabIndex={i === focusableIndex ? 0 : -1}
              className={cx(styles.option, checked && styles.checked, invalid && styles.invalid)}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{o.label}</span>
                {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
