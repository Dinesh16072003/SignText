import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import SetupNotice from '../components/SetupNotice'
import StatusLine from '../components/StatusLine'
import { deleteTranslation, listTranslations } from '../services/translations'

const SOURCE_LABELS = {
  live: 'Live camera',
  upload: 'Uploaded video',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const INITIAL_STATE = { status: 'loading', translations: [], error: '' }

function HistoryRow({ translation, onDelete, isDeleting }) {
  const [deleteError, setDeleteError] = useState('')

  async function handleDelete() {
    setDeleteError('')
    const result = await onDelete(translation.id)
    if (!result.ok) setDeleteError(result.message)
  }

  return (
    <li className="history-row">
      <div className="history-row-main">
        <p className="history-text">{translation.text}</p>
        <p className="history-meta">
          <span className="history-source">
            {SOURCE_LABELS[translation.source] ?? 'Unknown source'}
          </span>
          <span aria-hidden="true"> · </span>
          <time dateTime={translation.created_at}>
            {dateFormatter.format(new Date(translation.created_at))}
          </time>
        </p>
        {deleteError && (
          <p className="form-error" role="alert">
            {deleteError}
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-delete"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </li>
  )
}

export default function History() {
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

      <section className="pane history-pane" aria-labelledby="history-heading">
        <div className="pane-header">
          <h2 className="pane-title" id="history-heading">
            Saved translations
          </h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReload}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {isLoading && <p className="history-placeholder">Loading your saved translations...</p>}

        {state.status === 'error' && (
          <>
            <StatusLine tone="error">{state.error}</StatusLine>
            <div className="pane-actions">
              <button type="button" className="btn btn-secondary" onClick={handleReload}>
                Try again
              </button>
            </div>
          </>
        )}

        {state.status === 'ready' && !hasRows && (
          <div className="history-empty">
            <p className="text-empty-title">Nothing saved yet</p>
            <p className="text-empty-text">
              Save a translation from the Translate page and it will appear here.
            </p>
            <Link to="/" className="btn btn-primary">
              Go to Translate
            </Link>
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
      </section>
    </main>
  )
}