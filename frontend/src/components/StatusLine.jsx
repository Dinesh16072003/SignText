const TONE_CLASS = {
  loading: 'is-loading',
  ready: 'is-ready',
  error: 'is-error',
  idle: 'is-idle',
}

export default function StatusLine({ tone = 'idle', children }) {
  return (
    <p className={`status-line ${TONE_CLASS[tone] ?? 'is-idle'}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}