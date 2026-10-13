import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SIGN_MODEL_MESSAGES,
  loadSignModel,
  predictSign,
  predictTopClasses,
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
 *
 * `retry()` forgets a failed attempt and loads the same model again, used by
 * the Retry button. It changes nothing else about recognition.
 */
export function useSignModel() {
  const [state, setState] = useState({
    phase: 'loading',
    message: SIGN_MODEL_MESSAGES.loading,
    classNames: null,
  })
  const modelRef = useRef(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    let cancelled = false
    // StrictMode runs this effect twice in development: setup, cleanup, then
    // setup again. The ref survives both runs, so it must be set true here
    // again, or the second setup would think the component unmounted and the
    // model would never become ready in the dev server.
    isMountedRef.current = true

    loadOnce()
      .then((loaded) => {
        if (cancelled || !isMountedRef.current) return
        modelRef.current = loaded
        setState({
          phase: 'ready',
          message: SIGN_MODEL_MESSAGES.ready,
          classNames: loaded.classNames,
        })
      })
      .catch((error) => {
        if (cancelled || !isMountedRef.current) return
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
      isMountedRef.current = false
    }
  }, [])

  const retry = useCallback(() => {
    loadPromise = null
    modelRef.current = null
    setState({ phase: 'loading', message: SIGN_MODEL_MESSAGES.loading, classNames: null })

    loadOnce()
      .then((loaded) => {
        if (!isMountedRef.current) return
        modelRef.current = loaded
        setState({
          phase: 'ready',
          message: SIGN_MODEL_MESSAGES.ready,
          classNames: loaded.classNames,
        })
      })
      .catch((error) => {
        if (!isMountedRef.current) return
        modelRef.current = null
        console.error('Sign model could not be loaded:', error)
        setState({
          phase: error?.kind === 'missing' ? 'missing' : 'error',
          message: error?.message || SIGN_MODEL_MESSAGES.missing,
          classNames: null,
        })
      })
  }, [])

  const predict = useCallback((features) => predictSign(modelRef.current, features), [])

  // Extra read for the developer overlay: the top three candidates of the same
  // frame. Only the Translate page calls it, and only in development.
  const predictTop = useCallback(
    (features) => predictTopClasses(modelRef.current, features, 3),
    []
  )

  return {
    phase: state.phase,
    message: state.message,
    classNames: state.classNames,
    isReady: state.phase === 'ready',
    predict,
    predictTop,
    retry,
  }
}