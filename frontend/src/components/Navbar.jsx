import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'

export default function Navbar() {
  const { user, displayName, signOut, isLoadingSession } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const navigate = useNavigate()

  async function handleSignOut() {
    setIsSigningOut(true)
    const result = await signOut()
    setIsSigningOut(false)
    if (result.ok) navigate('/', { replace: true })
  }

  return (
    <header className="top-nav">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          ST
        </span>
        <span className="brand-text">Signtext</span>
      </Link>

      <nav className="top-nav-actions" aria-label="Account">
        {isLoadingSession ? (
          <span className="nav-status">Checking your account...</span>
        ) : user ? (
          <>
            <NavLink to="/history" className="btn btn-ghost">
              History
            </NavLink>
            <span className="nav-user" title={user.email ?? undefined}>
              {displayName}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </>
        ) : (
          <>
            <Link to="/signin" className="btn btn-secondary">
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-primary">
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  )
}