import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

const MINIMUM_PASSWORD_LENGTH = 8

export default function SignUp() {
  usePageTitle('Create account')
  const { signUp, error, notice, isWorking, isConfigured, setupMessage, isLoadingSession, user, clearMessages } =
    useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ displayName: '', email: '', password: '' })
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoadingSession && user) navigate('/history', { replace: true })
  }, [isLoadingSession, user, navigate])

  // The payload sent to the backend is exactly what it already expected.
  function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = {
      displayName: displayName.trim().length > 50 ? 'Keep the name under 50 characters.' : '',
      email: email.trim() && validateEmail(email) ? '' : 'Enter a valid email address.',
      password:
        password.length >= MINIMUM_PASSWORD_LENGTH
          ? ''
          : `Choose a password with at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    }
    setFieldErrors(nextErrors)
    if (nextErrors.displayName || nextErrors.email || nextErrors.password) return

    signUp({ email, password, displayName }).then((result) => {
      if (result.ok && !result.needsConfirmation) {
        navigate('/history', { replace: true })
      }
    })
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Create account</h1>
        <p className="page-subtitle">
          An account lets you save translations and read them again on any device.
        </p>
      </header>

      {!isConfigured && <SetupNotice message={setupMessage} />}

      <div className="auth-center">
        <Card title="Your account" id="signup-heading">
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Your name"
              value={displayName}
              onChange={(value) => {
                setDisplayName(value)
                setFieldErrors((current) => ({ ...current, displayName: '' }))
              }}
              autoComplete="name"
              hint="This is the name shown next to Sign out."
              required={false}
              error={fieldErrors.displayName}
            />
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
              autoComplete="new-password"
              hint={`Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`}
              error={fieldErrors.password}
            />

            {error && (
              <Alert tone="error" title="Could not create your account">
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
              {isWorking ? 'Creating your account\u2026' : 'Create account'}
            </Button>
          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/signin" onClick={clearMessages}>
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  )
}