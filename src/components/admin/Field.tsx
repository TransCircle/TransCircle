import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'
import styles from './Field.module.css'

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

/* ── TextField ───────────────────────────────────────────── */

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  invalid?: boolean
  required?: boolean
  fieldClassName?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, invalid, required, id, className, fieldClassName, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  return (
    <div className={cx(styles.field, fieldClassName)}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cx(styles.input, invalid && styles.invalid, className)}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        required={required}
        {...rest}
      />
      {hint && (
        <span id={hintId} className={cx(styles.hint, invalid && styles.hintError)}>
          {hint}
        </span>
      )}
    </div>
  )
})

/* ── TextArea ────────────────────────────────────────────── */

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  invalid?: boolean
  required?: boolean
  fieldClassName?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, invalid, required, id, className, fieldClassName, ...rest },
  ref,
) {
  const autoId = useId()
  const areaId = id ?? autoId
  const hintId = hint ? `${areaId}-hint` : undefined
  return (
    <div className={cx(styles.field, fieldClassName)}>
      {label && (
        <label htmlFor={areaId} className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        className={cx(styles.input, styles.textarea, invalid && styles.invalid, className)}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        required={required}
        {...rest}
      />
      {hint && (
        <span id={hintId} className={cx(styles.hint, invalid && styles.hintError)}>
          {hint}
        </span>
      )}
    </div>
  )
})

/* ── SearchField ─────────────────────────────────────────── */

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onValueChange: (value: string) => void
  onSearch?: () => void
  onClear?: () => void
  searchAriaLabel: string
  clearAriaLabel: string
  fieldClassName?: string
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onValueChange, onSearch, onClear, searchAriaLabel, clearAriaLabel, fieldClassName, className, ...rest },
  ref,
) {
  const handleClear = () => {
    onValueChange('')
    onClear?.()
  }
  return (
    <div role="search" className={cx(styles.search, fieldClassName)}>
      <span className={styles.searchIcon} aria-hidden="true">
        <SearchIcon />
      </span>
      <input
        ref={ref}
        type="search"
        value={value}
        aria-label={searchAriaLabel}
        className={cx(styles.input, styles.searchInput, className)}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSearch?.()
          }
        }}
        {...rest}
      />
      {value && (
        <button type="button" className={styles.clearBtn} onClick={handleClear} aria-label={clearAriaLabel}>
          <ClearIcon />
        </button>
      )}
    </div>
  )
})
