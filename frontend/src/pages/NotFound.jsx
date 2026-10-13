import { usePageTitle } from '../hooks/usePageTitle'
import Button from '../components/ui/Button'

function NotFound() {
  usePageTitle('Page not found')

  return (
    <main className="page">
      <div className="not-found">
        <header className="page-header">
          <h1 className="page-title">This page does not exist</h1>
          <p className="page-subtitle">
            The address may be wrong, or the page may have moved.
          </p>
        </header>
        <p>
          You can head back to the translator and start signing again.
        </p>
        <div className="pane-actions">
          <Button to="/" variant="primary">
            Go to Translate
          </Button>
          <Button to="/history" variant="secondary">
            Open History
          </Button>
        </div>
      </div>
    </main>
  )
}

export default NotFound