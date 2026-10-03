import { useId } from 'react'

export function TextField({ label, type = 'text', value, onChange, autoComplete, hint, required = true }) {
  const id = useId()
  const hintId = `${id}-hint`

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
        aria-describedby={hint ? hintId : undefined}
        required={required}
      />
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  )
}

export default TextField