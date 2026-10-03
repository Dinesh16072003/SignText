import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import SetupNotice from '../components/SetupNotice'
import TextField from '../components/TextField'

export default function SignIn() {
  const { signIn, error, notice, isWorking, isConfigured, setupMessage, isLoadingSession, user, clearMessages } =
    useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  const returnTo = location.state?.from ?? '/history'

  useEffect(() => {
    if (!isLoadingSession && user) navigate(returnTo, { replace: true })
  }, [isLoadingSession, user, navigate, returnTo])

  async function handleSubmit(event) {
    event.preventDefault()
    const result = await signIn({ email, password })
    if (result.ok) navigate(returnTo, { replace: true })
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Sign in</h1>
        <p className="page-subtitle">Sign in to keep your translations and come back to them later.</p>
      </header>

      {!isConfigured && <SetupNotice message={setupMessage} />}

      <section className="pane auth-pane" aria-labelledby="signin-heading">
        <h2 className="pane-title" id="signin-heading">
          Your account
        </h2>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isWorking || !isConfigured}
          >
            {isWorking ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          New to Signtext?{' '}
          <Link to="/signup" onClick={clearMessages}>
            Create an account
          </Link>
        </p>
      </section>
    </main>
  )
}