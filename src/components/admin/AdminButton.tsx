import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'
import { Spinner } from './Feedback'
import styles from './AdminButton.module.css'

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant
  size?: 'sm' | 'md'
  fullWidth?: boolean
  loading?: boolean
  iconLeft?: ReactNode
}

export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  { variant = 'secondary', size = 'md', fullWidth, loading, iconLeft, disabled, children, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cx(styles.btn, styles[variant], styles[size], fullWidth && styles.fullWidth, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" inline />
      ) : iconLeft ? (
        <span className={styles.icon} aria-hidden="true">
          {iconLeft}
        </span>
      ) : null}
      {children != null && <span className={styles.label}>{children}</span>}
    </button>
  )
})
