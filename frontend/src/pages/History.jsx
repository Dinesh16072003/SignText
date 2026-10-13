import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/auth-context'
import { usePageTitle } from '../hooks/usePageTitle'
import { useToast } from '../context/toast-context'
import SetupNotice from '../components/SetupNotice'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import { deleteTranslation, listTranslations } from '../services/translations'

const SOURCE_LABELS = {
  live: 'Live camera',
  upload: 'Uploaded video',
}

const SOURCE_ICONS = {
  live: 'camera',
  upload: 'upload',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const INITIAL_STATE = { status: 'loading', translations: [], error: '' }

function HistoryRow({ translation, onDelete, isDeleting }) {
  const { push } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(translation.text)
      push({ tone: 'success', message: 'Copied to clipboard' })
    } catch {
      push({ tone: 'error', message: 'Could not copy. Select the text manually.' })
    }
  }, [translation.text, push])

  async function handleDelete() {
    setDeleteError('')
    const result = await onDelete(translation.id)
    if (!result.ok) setDeleteError(result.message)
  }

  // Two steps so a mis-tap never removes a saved translation.
  function handleDeleteClicked() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    handleDelete()
  }

  return (
    <li className="history-card">
      <div className="history-card-main">
        <p className="history-text">{translation.text}</p>
        <p className="history-meta">
          <Badge tone="accent" icon={SOURCE_ICONS[translation.source] ?? 'text'}>
            {SOURCE_LABELS[translation.source] ?? 'Unknown source'}
          </Badge>
          <time dateTime={translation.created_at}>
            {dateFormatter.format(new Date(translation.created_at))}
          </time>
        </p>
        {deleteError && (
          <Alert tone="error" title="Could not delete">
            {deleteError}
          </Alert>
        )}
        {confirming && (
          <p className="confirm-row">
            Delete this translation?
            <Button
              type="button"
              variant="danger"
              size="small"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting\u2026' : 'Delete'}
            </Button>
            <Button type="button" variant="quiet" size="small" onClick={() => setConfirming(false)} disabled={isDeleting}>
              Cancel
            </Button>
          </p>
        )}
      </div>

      <div className="history-actions">
        <Button
          type="button"
          variant="secondary"
          size="small"
          icon="copy"
          onClick={handleCopy}
          aria-label={`Copy translation: ${translation.text.slice(0, 40)}`}
        >
          Copy
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="small"
          icon="trash"
          onClick={handleDeleteClicked}
          disabled={isDeleting}
          aria-label={`Delete translation: ${translation.text.slice(0, 40)}`}
        >
          {isDeleting ? 'Deleting\u2026' : 'Delete'}
        </Button>
      </div>
    </li>
  )
}

export default function History() {
  usePageTitle('History')
  const { user, isConfigured, setupMessage } = useAuth()
  const [state, setState] = useState(INITIAL_STATE)
  const [isDeletingId, setIsDeletingId] = useState('')
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    if (!user) return

    let active = true

    listTranslations().then((result) => {
      if (!active) return

      setState({
        status: result.ok ? 'ready' : 'error',
        translations: result.translations,
        error: result.ok ? '' : result.message,
      })
    })

    return () => {
      active = false
    }
  }, [user, reloadCount])

  const handleReload = useCallback(() => {
    setState({ status: 'loading', translations: [], error: '' })
    setReloadCount((count) => count + 1)
  }, [])

  const handleDelete = useCallback(async (id) => {
    setIsDeletingId(id)

    const result = await deleteTranslation(id)

    if (result.ok) {
      setState((current) => ({
        ...current,
        translations: current.translations.filter((item) => item.id !== id),
      }))
    }

    setIsDeletingId('')
    return result
  }, [])

  const isLoading = state.status === 'loading'
  const hasRows = state.translations.length > 0

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">History</h1>
        <p className="page-subtitle">Translations you have saved, newest first.</p>
      </header>

      {!isConfigured && <SetupNotice message={setupMessage} />}

      <Card
        title="Saved translations"
        id="history-heading"
        actions={
          <Button variant="secondary" icon="refresh" onClick={handleReload} disabled={isLoading}>
            {isLoading ? 'Loading\u2026' : 'Refresh'}
          </Button>
        }
      >
        {isLoading && (
          <div className="history-list" aria-hidden="true">
            <span className="skeleton" style={{ height: '120px' }} />
            <span className="skeleton" style={{ height: '84px' }} />
            <span className="skeleton" style={{ height: '84px' }} />
          </div>
        )}
        {isLoading && (
          <p className="status-line is-loading" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Loading your saved translations...</span>
          </p>
        )}

        {state.status === 'error' && (
          <>
            <Alert tone="error" title="Could not load your history">
              {state.error}
            </Alert>
            <div className="pane-actions">
              <Button variant="secondary" icon="refresh" onClick={handleReload}>
                Try again
              </Button>
            </div>
          </>
        )}

        {state.status === 'ready' && !hasRows && (
          <div className="history-empty">
            <p className="text-empty-title">Nothing saved yet</p>
            <p className="text-empty-text">
              Save a translation from the Translate page and it will appear here.
            </p>
            <Button to="/" variant="primary">
              Go to Translate
            </Button>
          </div>
        )}

        {state.status === 'ready' && hasRows && (
          <ul className="history-list">
            {state.translations.map((translation) => (
              <HistoryRow
                key={translation.id}
                translation={translation}
                onDelete={handleDelete}
                isDeleting={isDeletingId === translation.id}
              />
            ))}
          </ul>
        )}
      </Card>
    </main>
  )
}