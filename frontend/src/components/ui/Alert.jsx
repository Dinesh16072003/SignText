import Icon from './Icon'

const TONE_ICON = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'error',
}

const TONE_CLASS = {
  info: 'is-info',
  success: 'is-success',
  warning: 'is-warning',
  error: 'is-error',
}

/**
 * An inline alert. Error alerts announce immediately (role=alert); the other
 * tones use a polite live region.
 */
function Alert({ tone = 'info', title, children, className = '' }) {
  const isError = tone === 'error'
  return (
    <div
      className={`alert ${TONE_CLASS[tone] ?? 'is-info'} ${className}`}
      role={isError ? 'alert' : 'status'}
    >
      <span className="alert-icon" aria-hidden="true">
        <Icon name={TONE_ICON[tone] ?? 'info'} size="1.1em" />
      </span>
      <span className="alert-body">
        {title && <span className="alert-title">{title}</span>}
        <span>{children}</span>
      </span>
    </div>
  )
}

export default Alert