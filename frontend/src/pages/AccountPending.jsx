import { Link } from 'react-router-dom'

function AccountPending({ mode }) {
  const isSignIn = mode === 'signin'

  return (
<div className="page">
        <div className="page-header">
          <h1 className="page-title">{isSignIn ? 'Sign in' : 'Create account'}</h1>
          <p className="page-subtitle">Accounts are not part of this release yet.</p>
        </div>
        <section className="pane">
          <p className="page-subtitle">
            Signtext does not ask for an account today. Everything on the Translate page works
            without signing in, and your recordings stay on this device.
          </p>
          <div className="pane-actions">
            <Link to="/" className="btn btn-primary">
              Back to Translate
            </Link>
          </div>
        </section>
      </div>
  )
}

export default AccountPending