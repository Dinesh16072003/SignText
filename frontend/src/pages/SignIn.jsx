import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { usePageTitle } from '../hooks/usePageTitle'
import SetupNotice from '../components/SetupNotice'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import TextField, { PasswordField } from '../components/TextField'

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export default function SignIn() {
  usePageTitle('Sign in')
  const { signIn, error, notice, isWorking, isConfigured, setupMessage, isLoadingSession, user, clearMessages } =
    useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' })
  const navigate = useNavigate()
  const location = useLocation()

  const returnTo = location.state?.from ?? '/history'

  useEffect(() => {
    if (!isLoadingSession && user) navigate(returnTo, { replace: true })
  }, [isLoadingSession, user, navigate, returnTo])

  // The payload sent to the backend is exactly what it already expected.
  function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = {
      email: email.trim() && validateEmail(email) ? '' : 'Enter a valid email address.',
      password: password ? '' : 'Enter your password.',
    }
    setFieldErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return

    signIn({ email, password }).then((result) => {
      if (result.ok) navigate(returnTo, { replace: true })
    })
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Sign in</h1>
        <p className="page-subtitle">Sign in to keep your translations and come back to them later.</p>
      </header>

      {!isConfigured && <SetupNotice message={setupMessage} />}

      <div className="auth-center">
        <Card title="Your account" id="signin-heading">
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value)
                setFieldErrors((current) => ({ ...current, email: '' }))
              }}
              autoComplete="email"
              error={fieldErrors.email}
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={(value) => {
                setPassword(value)
                setFieldErrors((current) => ({ ...current, password: '' }))
              }}
              autoComplete="current-password"
              error={fieldErrors.password}
            />

            {error && (
              <Alert tone="error" title="Could not sign in">
                {error}
              </Alert>
            )}
            {notice && <Alert tone="info">{notice}</Alert>}

            <Button
              type="submit"
              variant="primary"
              className="btn-block"
              disabled={isWorking || !isConfigured}
              loading={isWorking}
            >
              {isWorking ? 'Signing in\u2026' : 'Sign in'}
            </Button>
          </form>

          <p className="auth-switch">
            New to Signtext?{' '}
            <Link to="/signup" onClick={clearMessages}>
              Create an account
            </Link>
          </p>
        </Card>
      </div>
    </main>
  )
}