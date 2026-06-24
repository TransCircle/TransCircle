import { useId, Children, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react'
import { FieldErrorContext } from './FieldError'
import styles from './FormField.module.css'

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
  htmlFor?: string
}

/**
 * Check if a React element is a native labelable form element per HTML spec.
 *
 * Only native `<input>`, `<select>`, and `<textarea>` elements are detected.
 * Wrapped custom components must use the `htmlFor` prop on FormField to
 * associate a label with the nested control (H3).
 */
function isLabelableElement(child: ReactElement): boolean {
  const { type } = child
  return type === 'select' || type === 'textarea' || type === 'input'
}

export const FormField = ({ label, required, error, children, htmlFor }: FormFieldProps) => {
  const generatedId = useId()
  const errorId = `error-${generatedId}`
  const fieldId = htmlFor || `field-${generatedId}`

  // Determine if the first direct child is a labelable form element
  const firstChild = Children.toArray(children)[0]
  const firstIsLabelable = isValidElement(firstChild) && isLabelableElement(firstChild as React.ReactElement)
  // Only auto-associate the label when we have a valid target
  const canAutoAssociate = !!htmlFor || firstIsLabelable

  const enhanced = Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    const props = child.props as Record<string, unknown>
    const extra: Record<string, unknown> = {}

    // Only inject id into labelable form elements (needed for <label htmlFor>).
    // For wrapper divs the caller manages ids manually via htmlFor prop.
    if (!htmlFor && !props.id && isLabelableElement(child)) {
      extra.id = fieldId
    }

    // Inject aria-describedby on labelable elements only, as screen readers
    // associate aria-describedby with form controls per WCAG 4.1.2
    if (error) {
      if (!props['aria-describedby'] && isLabelableElement(child)) {
        extra['aria-describedby'] = errorId
        extra['aria-invalid'] = true
      }
    }

    return Object.keys(extra).length > 0 ? cloneElement(child, extra) : child
  })

  return (
    <FieldErrorContext.Provider value={error ? errorId : null}>
      <div className={styles.fieldWrapper}>
        {label && canAutoAssociate && (
          <label htmlFor={fieldId} className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        {label && !canAutoAssociate && (
          <label className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        {enhanced}
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldErrorContext.Provider>
  )
}
