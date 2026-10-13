import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import Button from './ui/Button'
import Icon from './ui/Icon'
import ThemeToggle from './ui/ThemeToggle'

export default function Navbar() {
  const { user, displayName, signOut, isLoadingSession } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const userMenuRef = useRef(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Both / and /translate show the Translate page, so both mark it current.
  const isOnTranslate = pathname === '/' || pathname === '/translate'

  // Menus close when the person navigates, presses Escape, or clicks outside.
  const closeMenus = () => {
    setUserMenuOpen(false)
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    if (!userMenuOpen && !mobileMenuOpen) return undefined

    function onKey(event) {
      if (event.key === 'Escape') closeMenus()
    }
    function onClick(event) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target) &&
        !event.target.closest('.nav-menu-button')
      ) {
        setUserMenuOpen(false)
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [userMenuOpen, mobileMenuOpen])

  async function handleSignOut() {
    setIsSigningOut(true)
    const result = await signOut()
    setIsSigningOut(false)
    closeMenus()
    if (result.ok) navigate('/', { replace: true })
  }

  return (
    <header
      className="top-nav"
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeMenus()
      }}
    >
      <NavLink to="/" className="brand" onClick={closeMenus}>
        <span className="brand-mark" aria-hidden="true">
          ST
        </span>
        <span className="brand-text">Signtext</span>
      </NavLink>

      <nav className="app-nav" aria-label="Main">
        <NavLink
          to="/"
          end
          className="nav-link"
          aria-current={isOnTranslate ? 'page' : undefined}
          onClick={closeMenus}
        >
          Translate
        </NavLink>
        {user && (
          <NavLink to="/history" className="nav-link" onClick={closeMenus}>
            History
          </NavLink>
        )}
      </nav>

      <div className="top-nav-actions">
        <ThemeToggle />

        {isLoadingSession ? (
          <span className="nav-status">Checking your account...</span>
        ) : (
          <div className="top-nav-account">
            {user ? (
              <div className="user-menu" ref={userMenuRef}>
                <Button
                  variant="quiet"
                  className="nav-user"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((current) => !current)}
                >
                  <span className="nav-user-name">{displayName}</span>
                  <Icon name="chevron-down" size="1em" ariaHidden />
                </Button>

                {userMenuOpen && (
                  <div className="user-menu-menu" role="menu" aria-label="Account menu">
                    {user.email && user.email !== displayName && (
                      <span className="user-menu-email">{user.email}</span>
                    )}
                    <Button variant="quiet" icon="logout" onClick={handleSignOut} disabled={isSigningOut}>
                      {isSigningOut ? 'Signing out...' : 'Sign out'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Button to="/signin" variant="secondary" onClick={closeMenus}>
                  Sign in
                </Button>
                <Button to="/signup" variant="primary" onClick={closeMenus}>
                  Create account
                </Button>
              </>
            )}
          </div>
        )}

        <Button
          variant="quiet"
          className="btn-icon nav-menu-button"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav"
          aria-label="Menu"
          icon="menu"
          onClick={() => setMobileMenuOpen((current) => !current)}
        />
      </div>

      <nav className={`mobile-nav ${mobileMenuOpen ? 'is-open' : ''}`} id="mobile-nav" aria-label="Main">
        <NavLink
          to="/"
          end
          className="nav-link"
          aria-current={isOnTranslate ? 'page' : undefined}
          onClick={closeMenus}
        >
          Translate
        </NavLink>
        {user ? (
          <>
            <NavLink to="/history" className="nav-link" onClick={closeMenus}>
              History
            </NavLink>
            <Button variant="quiet" icon="logout" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </>
        ) : (
          <>
            <Button to="/signin" variant="secondary" className="btn-block" onClick={closeMenus}>
              Sign in
            </Button>
            <Button to="/signup" variant="primary" className="btn-block" onClick={closeMenus}>
              Create account
            </Button>
          </>
        )}
      </nav>
    </header>
  )
}