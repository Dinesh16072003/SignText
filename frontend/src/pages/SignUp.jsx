import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import SetupNotice from '../components/SetupNotice'
import TextField from '../components/TextField'

export default function SignUp() {
  const { signUp, error, notice, isWorking, isConfigured, setupMessage, isLoadingSession, user, clearMessages } =
    useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoadingSession && user) navigate('/history', { replace: true })
  }, [isLoadingSession, user, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    const result = await signUp({ email, password, displayName })

    if (result.ok && !result.needsConfirmation) {
      navigate('/history', { replace: true })
    }
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

      <section className="pane auth-pane" aria-labelledby="signup-heading">
        <h2 className="pane-title" id="signup-heading">
          Your account
        </h2>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Your name"
            value={displayName}
            onChange={setDisplayName}
            autoComplete="name"
            hint="This is the name shown next to Sign out."
            required={false}
          />
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
            autoComplete="new-password"
            hint="Use at least 8 characters."
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
            {isWorking ? 'Creating your account...' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/signin" onClick={clearMessages}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}