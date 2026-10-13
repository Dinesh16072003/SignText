import { Link } from 'react-router-dom'
import Icon from './Icon'

const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  quiet: 'btn-quiet',
  danger: 'btn-danger',
}

const SIZE_CLASS = {
  medium: '',
  small: 'btn-sm',
}

/**
 * One button style for the whole app. Pass `to` to render a router link with
 * the same look, or an `icon` for a leading inline icon.
 */
function Button({
  variant = 'secondary',
  size = 'medium',
  type = 'button',
  to,
  icon,
  loading = false,
  children,
  className = '',
  ...rest
}) {
  const classes = `btn ${VARIANT_CLASS[variant] ?? ''} ${SIZE_CLASS[size] ?? ''} ${className}`
  const content = (
    <>
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size="1.15em" ariaHidden />
      )}
      {children}
    </>
  )

  if (to) {
    return (
      <Link className={classes} to={to} aria-busy={loading || undefined} {...rest}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} disabled={loading || rest.disabled} {...rest}>
      {content}
    </button>
  )
}

export default Button