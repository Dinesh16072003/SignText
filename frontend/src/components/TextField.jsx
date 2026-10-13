import { useId, useState } from 'react'
import Icon from './ui/Icon'

function describeIds(...ids) {
  const present = ids.filter(Boolean)
  return present.length ? present.join(' ') : undefined
}

export function TextField({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  hint,
  error,
  required = true,
  ...rest
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = describeIds(hint ? hintId : null, error ? errorId : null)

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        className="field-input"
        id={id}
        name={label}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && !error && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-hint is-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * A password input with a show/hide toggle. The same field as everything else;
 * the toggle never changes what the form sends.
 */
export function PasswordField({ label, value, onChange, autoComplete, hint, error, required = true, ...rest }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = describeIds(hint ? hintId : null, error ? errorId : null)

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-field">
        <input
          className="field-input"
          id={id}
          name={label}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        <button
          type="button"
          className="btn btn-quiet btn-icon password-toggle"
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size="1.1em" ariaHidden />
        </button>
      </div>
      {hint && !error && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-hint is-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

export default TextField