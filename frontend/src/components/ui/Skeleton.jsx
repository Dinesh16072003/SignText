/**
 * Shimmer placeholder for content that is still loading. Purely decorative;
 * pair it with a live status message so screen readers hear real words.
 */
function Skeleton({ className = '', style = {} }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />
}

export default Skeleton