import Icon from './Icon'

const TONE_CLASS = {
  accent: 'is-accent',
  success: 'is-success',
  warning: 'is-warning',
  error: 'is-error',
  neutral: 'is-neutral',
}

/**
 * A small status chip. Always carries an icon plus text so meaning never rests
 * on color alone.
 */
function Badge({ tone = 'neutral', icon, children, className = '' }) {
  return (
    <span className={`badge ${TONE_CLASS[tone] ?? 'is-neutral'} ${className}`}>
      {icon && <Icon name={icon} size="1.05em" ariaHidden />}
      {children}
    </span>
  )
}

export default Badge