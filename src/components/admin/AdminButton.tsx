import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'
import { Spinner } from './Feedback'
import styles from './AdminButton.module.css'

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'softError'

export interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant
  size?: 'sm' | 'md'
  fullWidth?: boolean
  loading?: boolean
  iconLeft?: ReactNode
  /** 站内导航：渲染为 react-router <Link>，类名与按钮完全一致。 */
  to?: string
  /** 外部链接：渲染为 <a>，类名与按钮完全一致。 */
  href?: string
}

export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  {
    variant = 'secondary',
    size = 'md',
    fullWidth,
    loading,
    iconLeft,
    disabled,
    children,
    className,
    type,
    to,
    href,
    onClick,
    ...rest
  },
  ref,
) {
  const cls = cx(styles.btn, styles[variant], styles[size], fullWidth && styles.fullWidth, className)
  const inactive = Boolean(disabled || loading)
  const content = (
    <>
      {loading ? (
        <Spinner size="sm" inline />
      ) : iconLeft ? (
        <span className={styles.icon} aria-hidden="true">
          {iconLeft}
        </span>
      ) : null}
      {children != null && <span className={styles.label}>{children}</span>}
    </>
  )

  // 链接形态：<a> 没有原生 disabled/loading，降级为 aria-disabled +
  // 拦截点击 + 移出 Tab 序，视觉与按钮 disabled 一致（CSS 兜底）。
  if (to != null || href != null) {
    const linkProps = {
      // 按钮与链接的 HTML 属性集高度重叠（id/aria-*/data-*/style 等），
      // 按钮特有项（form/value 等）在链接场景本就不会被传入，此处收窄断言。
      ...(rest as AnchorHTMLAttributes<HTMLAnchorElement>),
      className: cls,
      'aria-disabled': inactive || undefined,
      'aria-busy': loading || undefined,
      tabIndex: inactive ? -1 : undefined,
      onClick: ((e) => {
        if (inactive) {
          e.preventDefault()
          return
        }
        onClick?.(e as unknown as Parameters<NonNullable<typeof onClick>>[0])
      }) satisfies MouseEventHandler<HTMLElement>,
      ref: ref as unknown as Ref<HTMLAnchorElement>,
    }
    if (to != null) {
      return (
        <Link to={to} {...linkProps}>
          {content}
        </Link>
      )
    }
    return (
      <a href={href} {...linkProps}>
        {content}
      </a>
    )
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cls}
      disabled={inactive}
      aria-busy={loading || undefined}
      onClick={onClick}
      {...rest}
    >
      {content}
    </button>
  )
})
