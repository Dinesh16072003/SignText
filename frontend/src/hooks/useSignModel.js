import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SIGN_MODEL_MESSAGES,
  loadSignModel,
  predictSign,
} from '../services/signModel'

// The model is loaded once for the whole app, not once per mount. React
// StrictMode runs effects twice in development, and without this the model
// would be downloaded twice on every page open.
let loadPromise = null

function loadOnce() {
  if (!loadPromise) {
    loadPromise = loadSignModel().catch((error) => {
      loadPromise = null
      throw error
    })
  }
  return loadPromise
}

/**
 * Loads the sign model in the background and hands back a stable predict
 * function. The page can render while this is running: the status line shows
 * "Loading sign model...", then "Sign model ready", or the reason it failed.
 */
export function useSignModel() {
  const [state, setState] = useState({
    phase: 'loading',
    message: SIGN_MODEL_MESSAGES.loading,
    classNames: null,
  })
  const modelRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    loadOnce()
      .then((loaded) => {
        if (cancelled) return
        modelRef.current = loaded
        setState({
          phase: 'ready',
          message: SIGN_MODEL_MESSAGES.ready,
          classNames: loaded.classNames,
        })
      })
      .catch((error) => {
        if (cancelled) return
        modelRef.current = null
        console.error('Sign model could not be loaded:', error)
        setState({
          phase: error?.kind === 'missing' ? 'missing' : 'error',
          message: error?.message || SIGN_MODEL_MESSAGES.missing,
          classNames: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const predict = useCallback((features) => predictSign(modelRef.current, features), [])

  return {
    phase: state.phase,
    message: state.message,
    classNames: state.classNames,
    isReady: state.phase === 'ready',
    predict,
  }
}
