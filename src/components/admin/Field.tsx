import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { useTranslation } from 'react-i18next'
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

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2.06 12.35a1 1 0 0 1 0-.7C3.42 8.1 7.35 5 12 5s8.58 3.1 9.94 6.65a1 1 0 0 1 0 .7C20.58 15.9 16.65 19 12 19s-8.58-3.1-9.94-6.65Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c4.65 0 8.58 3.1 9.94 6.65a1 1 0 0 1 0 .7 13.2 13.2 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61C4.62 7.9 3.06 9.72 2.06 11.65a1 1 0 0 0 0 .7C3.42 15.9 7.35 19 12 19c1.99 0 3.84-.57 5.39-1.53" />
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="m2 2 20 20" />
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
  { label, hint, invalid, required, id, className, fieldClassName, type, ...rest },
  ref,
) {
  const { t } = useTranslation()
  const autoId = useId()
  // 密码可见性开关：仅切换 input 的 type，按钮绝对定位不占布局宽度。
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const input = (
    <input
      ref={ref}
      id={inputId}
      type={isPassword ? (revealed ? 'text' : 'password') : type}
      className={cx(styles.input, isPassword && styles.inputWithToggle, invalid && styles.invalid, className)}
      aria-invalid={invalid || undefined}
      aria-describedby={hintId}
      required={required}
      {...rest}
    />
  )
  return (
    <div className={cx(styles.field, fieldClassName)}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true">*</span>}
        </label>
      )}
      {isPassword ? (
        <div className={styles.inputWrap}>
          {input}
          <button
            type="button"
            className={styles.toggleBtn}
            aria-label={revealed ? t('auth.password.hide') : t('auth.password.show')}
            aria-pressed={revealed}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      ) : (
        input
      )}
      {hint && (
        /* aria-live 仅在错误态启用:普通 hint(如 ReasonPromptDialog 的「N / 500」字数计数)
           若恒为 live,读屏器会逐键播报计数,极度嘈杂;错误文案才需即时播报。 */
        <span id={hintId} aria-live={invalid ? 'polite' : undefined} className={cx(styles.hint, invalid && styles.hintError)}>
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
        /* 与 TextField 同理：仅错误态 live,避免字数计数等普通 hint 逐键播报。 */
        <span id={hintId} aria-live={invalid ? 'polite' : undefined} className={cx(styles.hint, invalid && styles.hintError)}>
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
