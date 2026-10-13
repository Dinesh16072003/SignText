/**
 * A busy indicator. The ring animates; the optional label is announced to
 * screen readers and is never the only way the state is conveyed.
 */
function Spinner({ label = 'Loading', quiet = false }) {
  return (
    <span className={quiet ? 'status-line' : 'status-line is-loading'} role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

export default Spinner