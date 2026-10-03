import { useCallback, useRef, useState } from 'react'

const CAMERA_MESSAGES = {
  NotAllowedError:
    'Camera access was blocked. Allow camera access for this site in your browser settings, then choose Use camera again.',
  NotFoundError:
    'No camera was found on this device. Connect a camera, then choose Use camera again.',
  NotReadableError:
    'Your camera is already in use by another app. Close the other app, then choose Use camera again.',
  OverconstrainedError:
    'This camera cannot provide a usable video. Try a different camera, then choose Use camera again.',
  SecurityError:
    'Camera access needs a secure connection. Open this page over HTTPS or on localhost, then choose Use camera again.',
}

const CAMERA_FALLBACK_MESSAGE =
  'The camera could not be started. Close other apps that may be using it, check your camera settings, then choose Use camera again.'

export function describeCameraError(cameraError) {
  if (!cameraError) return ''
  return CAMERA_MESSAGES[cameraError.name] ?? CAMERA_FALLBACK_MESSAGE
}

export function useCamera() {
  const [error, setError] = useState(null)
  const [isStarting, setIsStarting] = useState(false)
  const streamRef = useRef(null)

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupported = new Error('getUserMedia is unavailable')
      unsupported.name = 'NotFoundError'
      setError(unsupported)
      return { ok: false, error: unsupported }
    }

    setIsStarting(true)
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      setIsStarting(false)
      return { ok: true, stream }
    } catch (cameraError) {
      console.error('Camera could not be started:', cameraError)
      setIsStarting(false)
      setError(cameraError)
      return { ok: false, error: cameraError }
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  return { start, stop, error, clearError, isStarting, getStream: () => streamRef.current }
}