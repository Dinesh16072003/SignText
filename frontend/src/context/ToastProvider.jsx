import { useCallback, useRef, useState } from 'react'
import { ToastContext } from './toast-context'
import Icon from '../components/ui/Icon'

let nextId = 0

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
 * Shows short-lived notices that never block the page and never matter on
 * their own: the same information always appears inline as well.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    ({ tone = 'info', title = '', message = '', duration = 4000 } = {}) => {
      const id = nextId++
      setToasts((current) => [...current.slice(-3), { id, tone, title, message }])
      const timer = setTimeout(() => dismiss(id), duration)
      timersRef.current.set(id, timer)
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="toaster" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${TONE_CLASS[toast.tone] ?? 'is-info'}`}
            role="status"
          >
            <Icon name={TONE_ICON[toast.tone] ?? 'info'} size="1.1em" ariaHidden />
            <span className="toast-body">
              {toast.title && <strong>{toast.title}</strong>}
              {toast.message ? <span>{toast.message}</span> : <span>{toast.title}</span>}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export default ToastProvider