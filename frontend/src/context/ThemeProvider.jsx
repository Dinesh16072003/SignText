import { useCallback, useEffect, useState } from 'react'
import { ThemeContext } from './theme-context'

const STORAGE_KEY = 'signtext-theme'

function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function systemIsDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/**
 * Theme for the whole app. Follows the system setting until someone chooses a
 * theme in the navigation bar; that choice is remembered in localStorage.
 * The <html data-theme> attribute drives every design token (see index.css).
 */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => readPreference())
  const [systemDark, setSystemDark] = useState(() => systemIsDark())

  // Stay in sync with the operating system while no explicit preference is set.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return undefined

    const onChange = (event) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const isDark = preference === 'dark' ? true : preference === 'light' ? false : systemDark

  // Keep <html data-theme> in sync. The boot script in index.html sets it
  // before first paint so there is no flash of the wrong theme.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggle = useCallback(() => {
    setPreference((current) => {
      const explicitDark =
        current === 'dark' ? true : current === 'light' ? false : systemDark
      const next = explicitDark ? 'light' : 'dark'
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Storing is best-effort; the theme still changes for this session.
      }
      return next
    })
  }, [systemDark])

  return (
    <ThemeContext.Provider value={{ isDark, theme: isDark ? 'dark' : 'light', toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export default ThemeProvider