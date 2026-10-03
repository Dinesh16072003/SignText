import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import StatusLine from './StatusLine'
import { saveTranslation } from '../services/translations'

const IDLE_MESSAGE = 'Sign recognition is not connected yet, so no text is produced.'

function TextPane({ source }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState({ tone: 'idle', text: '' })
  const [isSaving, setIsSaving] = useState(false)

  const isSignedIn = Boolean(user)
  const hasText = text.trim().length > 0
  const hasSource = source === 'live' || source === 'upload'

  const handleCopy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ tone: 'ready', text: 'Text copied to your clipboard.' })
    } catch {
      setNotice({
        tone: 'error',
        text: 'Copying did not work. Select the text and copy it manually.',
      })
    }
  }, [text])

  const handleClear = useCallback(() => {
    setText('')
    setNotice({ tone: 'idle', text: 'Text cleared.' })
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    const result = await saveTranslation({ text, source })
    setIsSaving(false)

    setNotice(
      result.ok
        ? { tone: 'ready', text: 'Saved to your history.' }
        : { tone: 'error', text: result.message }
    )
  }, [text, source])

  return (
    <section className="pane" aria-labelledby="text-pane-title">
      <div className="pane-header">
        <h2 className="pane-title" id="text-pane-title">
          Text
        </h2>
        <div className="pane-actions">
          {isSignedIn && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!hasText || !hasSource || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save to history'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCopy}
            disabled={!hasText}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClear}
            disabled={!hasText}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="text-surface">
        <label className="visually-hidden" htmlFor="translation-text">
          Translation text
        </label>
        <textarea
          id="translation-text"
          className="text-input"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setNotice({ tone: 'idle', text: '' })
          }}
          placeholder="Recognised text will appear here. You can also type or paste text to save it."
          rows={8}
          spellCheck="false"
        />
        {!hasText && (
          <p className="text-empty" aria-hidden="true">
            <span className="text-empty-title">Nothing translated yet</span>
            <span className="text-empty-text">
              Start your camera or upload a video. Recognised text will appear here.
            </span>
          </p>
        )}
      </div>

      <StatusLine tone={notice.tone}>
        {notice.text || (isSignedIn ? IDLE_MESSAGE : `${IDLE_MESSAGE} Sign in to save translations.`)}
      </StatusLine>

      {!isSignedIn && (
        <p className="text-hint">
          You can use the translator without an account.{' '}
          <Link to="/signin">Sign in</Link> to save translations.
        </p>
      )}

      {isSignedIn && !hasSource && (
        <p className="text-hint">Start the camera or upload a video, then you can save this text.</p>
      )}
    </section>
  )
}

export default TextPane