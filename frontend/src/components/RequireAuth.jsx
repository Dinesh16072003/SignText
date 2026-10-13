import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import SetupNotice from './SetupNotice'

/**
 * Wraps pages that need a signed-in person. While the session is still being
 * checked a skeleton is shown, so a signed-in person never sees the sign-in
 * page flash on a reload.
 */
export default function RequireAuth({ children }) {
  const { user, isLoadingSession, isConfigured, setupMessage } = useAuth()
  const location = useLocation()

  if (isLoadingSession) {
    return (
      <main className="page">
        <header className="page-header">
          <h1 className="page-title" aria-hidden="true">
            <span className="skeleton" style={{ width: '220px', height: '36px', display: 'inline-block' }} />
          </h1>
          <p className="page-subtitle" aria-hidden="true">
            <span className="skeleton" style={{ width: '340px', height: '16px', display: 'inline-block' }} />
          </p>
        </header>
        <p className="status-line is-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Checking your account...</span>
        </p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  }

  return (
    <>
      {!isConfigured && <SetupNotice message={setupMessage} />}
      {children}
    </>
  )
}