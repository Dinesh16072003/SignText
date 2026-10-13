import Icon from './Icon'
import { useTheme } from '../../context/theme-context'

/**
 * Switches between light and dark theme. The choice is remembered; the system
 * setting is used until the person picks a theme themselves.
 */
function ThemeToggle() {
  const { isDark, toggle } = useTheme()

  return (
    <button
      type="button"
      className="btn btn-quiet btn-icon"
      onClick={toggle}
      aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
      title={isDark ? 'Use light theme' : 'Use dark theme'}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size="1.2em" ariaHidden />
    </button>
  )
}

export default ThemeToggle