import StatusLine from './StatusLine'

/**
 * Shown instead of account features when the Supabase keys are missing.
 */
export default function SetupNotice({ message }) {
  return (
    <div className="setup-notice" role="region" aria-label="Setup needed">
      <p className="setup-notice-title">Account features are not set up</p>
      <p className="setup-notice-text">{message}</p>
      <p className="setup-notice-text">
        The translator still works for guests. Nothing you record leaves this device.
      </p>
    </div>
  )
}

export function SetupStatusLine({ message }) {
  return (
    <StatusLine tone="error">{message}</StatusLine>
  )
}