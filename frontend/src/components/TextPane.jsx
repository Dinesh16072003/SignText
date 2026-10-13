import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useToast } from '../context/toast-context'
import { saveTranslation } from '../services/translations'
import Alert from './ui/Alert'
import Button from './ui/Button'
import Skeleton from './ui/Skeleton'
import StatusLine from './StatusLine'

const IDLE_MESSAGE = 'Copy the text when you are finished, or Clear to start again.'

const TEXT_SIZES = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
  { id: 'xl', label: 'Extra large' },
]

function TextPane({ source, text, onTextChange, onClear, modelStatus, onRetryModel }) {
  const { user } = useAuth()
  const { push } = useToast()
  const [notice, setNotice] = useState({ tone: 'idle', text: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [textSize, setTextSize] = useState('md')
  const [announcement, setAnnouncement] = useState('')
  const lastEditAtRef = useRef(0)
  const announcedLengthRef = useRef(text.length)

  const isSignedIn = Boolean(user)
  const hasText = text.trim().length > 0
  const hasSource = source === 'live' || source === 'upload'
  const isModelLoading = modelStatus.tone === 'loading'
  const isModelFailed = modelStatus.tone === 'error'

  // Recognized text is announced politely, without stealing focus. Manual
  // typing is skipped so the reading stays calm.
  useEffect(() => {
    const now = Date.now()
    const isRecognitionUpdate =
      text.length > announcedLengthRef.current && now - lastEditAtRef.current > 400

    if (isRecognitionUpdate) {
      const added = text.slice(announcedLengthRef.current)
      if (added.trim()) setAnnouncement(`Recognised: ${added}`)
    }
    announcedLengthRef.current = text.length
  }, [text])

  const handleTextChange = useCallback(
    (value) => {
      lastEditAtRef.current = Date.now()
      setNotice({ tone: 'idle', text: '' })
      onTextChange(value)
    },
    [onTextChange]
  )

  const handleCopy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setNotice({ tone: 'ready', text: 'Text copied to your clipboard.' })
      push({ tone: 'success', message: 'Copied to clipboard' })
    } catch {
      setNotice({
        tone: 'error',
        text: 'Copying did not work. Select the text and copy it manually.',
      })
      push({ tone: 'error', message: 'Could not copy. Select the text manually.' })
    }
  }, [text, push])

  const handleClear = useCallback(() => {
    onClear()
    setNotice({ tone: 'idle', text: 'Text cleared.' })
  }, [onClear])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    const result = await saveTranslation({ text, source })
    setIsSaving(false)

    if (result.ok) {
      setNotice({ tone: 'ready', text: 'Saved to your history.' })
      push({ tone: 'success', message: 'Saved to history' })
    } else {
      setNotice({ tone: 'error', text: result.message })
      push({ tone: 'error', message: result.message })
    }
  }, [text, source, push])

  return (
    <section className="pane" aria-labelledby="text-pane-title">
      <div className="pane-header">
        <h2 className="pane-title" id="text-pane-title">
          Text
        </h2>
        <div className="pane-actions">
          <div className="text-size-control" role="group" aria-label="Text size">
            <span className="text-size-control-label">Text size</span>
            {TEXT_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                className="text-size-button"
                aria-pressed={textSize === size.id}
                onClick={() => setTextSize(size.id)}
              >
                {size.label}
              </button>
            ))}
          </div>

          {isSignedIn && (
            <Button
              variant="primary"
              icon="history"
              onClick={handleSave}
              disabled={!hasText || !hasSource || isSaving}
              loading={isSaving}
            >
              {isSaving ? 'Saving\u2026' : 'Save to history'}
            </Button>
          )}
          <Button variant="secondary" icon="copy" onClick={handleCopy} disabled={!hasText}>
            Copy
          </Button>
          <Button variant="secondary" icon="close" onClick={handleClear} disabled={!hasText}>
            Clear
          </Button>
        </div>
      </div>

      {!isModelFailed && (
        <StatusLine tone={modelStatus.tone}>{modelStatus.text}</StatusLine>
      )}

      {isModelFailed && (
        <>
          <Alert tone="error" title="The sign model did not load">
            {modelStatus.text}
          </Alert>
          <div className="pane-actions">
            <Button variant="secondary" icon="refresh" onClick={onRetryModel}>
              Try again
            </Button>
          </div>
        </>
      )}

      {isModelLoading ? (
        <div className="text-surface" aria-hidden="true">
          <div className="text-loading-lines">
            <Skeleton style={{ width: '92%', height: '16px' }} />
            <Skeleton style={{ width: '78%', height: '16px' }} />
            <Skeleton style={{ width: '88%', height: '16px' }} />
            <Skeleton style={{ width: '55%', height: '16px' }} />
          </div>
        </div>
      ) : (
        <div className={`text-surface text-size-${textSize}`}>
          <label className="visually-hidden" htmlFor="translation-text">
            Translation text
          </label>
          <textarea
            id="translation-text"
            className="text-input"
            value={text}
            onChange={(event) => handleTextChange(event.target.value)}
            placeholder="Recognised text will appear here. You can also type or paste text to save it."
            rows={8}
            spellCheck="false"
          />
          {!hasText && (
            <p className="text-empty" aria-hidden="true">
              <span className="text-empty-title">Your text will appear here</span>
              <span className="text-empty-text">
                Start your camera or upload a video, and the words you sign will show up here.
              </span>
            </p>
          )}
        </div>
      )}

      <StatusLine tone={notice.tone}>
        {notice.text ||
          (isSignedIn ? IDLE_MESSAGE : `${IDLE_MESSAGE} Sign in to save translations.`)}
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

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  )
}

export default TextPane