import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import SetupNotice from './SetupNotice'

/**
 * Wraps pages that need a signed-in person. While the session is still being
 * checked nothing is shown, so a signed-in person never sees the sign-in page
 * flash on a reload.
 */
export default function RequireAuth({ children }) {
  const { user, isLoadingSession, isConfigured, setupMessage } = useAuth()
  const location = useLocation()

  if (isLoadingSession) {
    return (
      <main className="page">
        <p className="history-placeholder">Checking your account...</p>
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