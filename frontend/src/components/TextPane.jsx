import { useCallback, useState } from 'react'
import StatusLine from './StatusLine'

function TextPane() {
  const [text, setText] = useState('')
  const [copyNotice, setCopyNotice] = useState('')

  const handleCopy = useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyNotice('Text copied to your clipboard.')
    } catch {
      setCopyNotice('Copying did not work. Select the text and copy it manually.')
    }
  }, [text])

  const handleClear = useCallback(() => {
    setText('')
    setCopyNotice('')
  }, [])

  const hasText = text.trim().length > 0
  const idleMessage = 'Sign recognition is not connected yet, so no text is produced.'

  return (
    <section className="pane" aria-labelledby="text-pane-title">
      <div className="pane-header">
        <h2 className="pane-title" id="text-pane-title">
          Text
        </h2>
        <div className="pane-actions">
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
        {hasText ? (
          <p className="text-output">{text}</p>
        ) : (
          <div className="text-empty">
            <p className="text-empty-title">Nothing translated yet</p>
            <p className="text-empty-text">
              Start your camera or upload a video. Recognised text will appear here.
            </p>
          </div>
        )}
      </div>

      <StatusLine tone="idle">{copyNotice || idleMessage}</StatusLine>
    </section>
  )
}

export default TextPane