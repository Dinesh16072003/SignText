import { useEffect } from 'react'

/**
 * Sets the document title for a route. The base name comes from index.html;
 * each page appends its own suffix.
 */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `Signtext – ${title}` : 'Signtext'
  }, [title])
}

export default usePageTitle