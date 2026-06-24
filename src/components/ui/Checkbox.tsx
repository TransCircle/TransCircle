import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { cx } from '../admin/cx'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label: ReactNode
  hint?: string
  invalid?: boolean
  indeterminate?: boolean
  fieldClassName?: string
}

/**
 * Custom-styled checkbox: a visually-hidden native `<input>` (so Space toggles and
 * screen readers work natively) paired with a drawn box + check SVG. The clickable
 * label row is the ≥40px touch target on coarse pointers.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, invalid, indeterminate, id, className, fieldClassName, disabled, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const innerRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement, [])

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = !!indeterminate
  }, [indeterminate])

  return (
    <div className={cx(styles.field, fieldClassName)}>
      <label htmlFor={inputId} className={cx(styles.row, disabled && styles.disabled, invalid && styles.invalid)}>
        <input
          ref={innerRef}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          className={cx(styles.input, className)}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          {...rest}
        />
        <span className={styles.box} aria-hidden="true">
          <svg className={styles.check} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className={styles.dash} />
        </span>
        <span className={styles.labelText}>{label}</span>
      </label>
      {hint && (
        <span id={hintId} className={cx(styles.hint, invalid && styles.hintError)}>
          {hint}
        </span>
      )}
    </div>
  )
})
