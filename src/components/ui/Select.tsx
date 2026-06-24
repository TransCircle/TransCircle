import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cx } from '../admin/cx'
import styles from './Select.module.css'

const ChevronIcon = () => (
  <svg className={styles.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const CheckIcon = () => (
  <svg className={styles.check} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  disabled?: boolean
}

export interface SelectProps<V extends string = string> {
  label?: string
  hint?: string
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
  value: V | null
  onChange: (value: V) => void
  options: ReadonlyArray<SelectOption<V>>
  id?: string
  fieldClassName?: string
  /** aria-label when no visible `label` is supplied. */
  ariaLabel?: string
  renderOption?: (opt: SelectOption<V>, state: { active: boolean; selected: boolean }) => ReactNode
}

/**
 * Accessible single-select listbox (APG "select-only combobox"): a `role=combobox`
 * trigger + `role=listbox` popup with `aria-activedescendant`; focus stays on the
 * trigger. Replaces native `<select>` and matches the design-system Field visuals.
 */
export function Select<V extends string = string>({
  label,
  hint,
  invalid,
  disabled,
  placeholder,
  value,
  onChange,
  options,
  id,
  fieldClassName,
  ariaLabel,
  renderOption,
}: SelectProps<V>) {
  const base = useId()
  const triggerId = id ?? `${base}-trigger`
  const listId = `${base}-list`
  const labelId = label ? `${base}-label` : undefined
  const hintId = hint ? `${base}-hint` : undefined

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => (selectedIndex >= 0 ? selectedIndex : 0))

  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef<{ buf: string; timer: number | undefined }>({ buf: '', timer: undefined })

  const optId = (i: number) => `${base}-opt-${i}`

  const findEnabled = (from: number, dir: 1 | -1): number => {
    for (let i = from; i >= 0 && i < options.length; i += dir) {
      if (!options[i]?.disabled) return i
    }
    return -1
  }

  // Close on outside pointer.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return
    const node = listRef.current?.children[active] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const commit = (i: number) => {
    const o = options[i]
    if (!o || o.disabled) return
    onChange(o.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const openWith = (idx: number) => {
    const start = idx >= 0 && !options[idx]?.disabled ? idx : findEnabled(0, 1)
    setActive(start >= 0 ? start : 0)
    setOpen(true)
  }

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    const last = options.length - 1
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) commit(active)
        else openWith(selectedIndex)
        break
      case 'ArrowDown': {
        e.preventDefault()
        if (!open) { openWith(selectedIndex); break }
        const n = findEnabled(active + 1, 1)
        if (n !== -1) setActive(n)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (!open) { openWith(selectedIndex >= 0 ? selectedIndex : findEnabled(last, -1)); break }
        const n = findEnabled(active - 1, -1)
        if (n !== -1) setActive(n)
        break
      }
      case 'Home': {
        if (!open) return
        e.preventDefault()
        const n = findEnabled(0, 1)
        if (n !== -1) setActive(n)
        break
      }
      case 'End': {
        if (!open) return
        e.preventDefault()
        const n = findEnabled(last, -1)
        if (n !== -1) setActive(n)
        break
      }
      case 'Escape':
        if (open) { e.preventDefault(); setOpen(false) }
        break
      case 'Tab':
        if (open) setOpen(false)
        break
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const buf = typeahead.current.buf + e.key.toLowerCase()
          typeahead.current.buf = buf
          window.clearTimeout(typeahead.current.timer)
          typeahead.current.timer = window.setTimeout(() => { typeahead.current.buf = '' }, 500)
          const match = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(buf))
          if (match !== -1) { setActive(match); if (!open) setOpen(true) }
        }
    }
  }

  return (
    <div className={cx(styles.field, fieldClassName)}>
      {label && (
        <span id={labelId} className={styles.label}>
          {label}
        </span>
      )}
      <div ref={wrapRef} className={styles.wrap}>
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? optId(active) : undefined}
          aria-labelledby={labelId}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          className={cx(styles.trigger, open && styles.open, invalid && styles.invalid)}
          onClick={() => (open ? setOpen(false) : openWith(selectedIndex))}
          onKeyDown={handleKey}
        >
          <span className={cx(styles.value, !selected && styles.placeholder)}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronIcon />
        </button>
        {open && (
          <ul ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} className={styles.listbox} tabIndex={-1}>
            {options.map((o, i) => {
              const isSelected = o.value === value
              return (
                <li
                  key={o.value}
                  id={optId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  className={cx(
                    styles.option,
                    i === active && styles.active,
                    isSelected && styles.selected,
                    o.disabled && styles.optionDisabled,
                  )}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onClick={() => commit(i)}
                >
                  <span className={styles.optionLabel}>
                    {renderOption ? renderOption(o, { active: i === active, selected: isSelected }) : o.label}
                  </span>
                  {isSelected && <CheckIcon />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {hint && (
        <span id={hintId} className={cx(styles.hint, invalid && styles.hintError)}>
          {hint}
        </span>
      )}
    </div>
  )
}
