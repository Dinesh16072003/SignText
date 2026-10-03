import { Link } from 'react-router-dom'

function Navbar() {
  return (
    <header className="top-nav">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          ST
        </span>
        <span className="brand-text">Signtext</span>
      </Link>

      <nav className="top-nav-actions" aria-label="Account">
        <Link to="/signin" className="btn btn-secondary">
          Sign in
        </Link>
        <Link to="/signup" className="btn btn-primary">
          Create account
        </Link>
      </nav>
    </header>
  )
}

export default Navbar