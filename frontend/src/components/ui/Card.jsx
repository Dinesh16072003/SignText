/**
 * A surface that groups content. Optional title and action area.
 */
function Card({ title, id, actions = null, className = '', children, ...rest }) {
  return (
    <section
      className={`card ${className}`}
      aria-labelledby={id}
      {...rest}
    >
      {(title || actions) && (
        <div className="card-header">
          {title && (
            <h2 className="card-title" id={id}>
              {title}
            </h2>
          )}
          {actions && <div className="pane-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export default Card