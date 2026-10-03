import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// Both the runtime and the model are served from this app, so hand tracking
// keeps working without an internet connection.
const VISION_FILESET_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`
const MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`

const LOADING_MESSAGE = 'Loading hand tracking...'
const READY_MESSAGE = 'Hand tracking ready'
const LOAD_ERROR_MESSAGE =
  'Hand tracking could not start. Reload the page to try again. If this keeps happening, check that your browser is up to date.'

export function useHandTracker() {
  const [landmarker, setLandmarker] = useState(null)
  const [error, setError] = useState('')
  const landmarkerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function createTracker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(VISION_FILESET_PATH)
        const created = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })

        if (cancelled) {
          created.close()
          return
        }

        landmarkerRef.current = created
        setLandmarker(created)
      } catch (createError) {
        if (cancelled) return
        console.error('Hand tracking could not start:', createError)
        setError(LOAD_ERROR_MESSAGE)
      }
    }

    createTracker()

    return () => {
      cancelled = true
      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  return {
    landmarker,
    error,
    isReady: landmarker !== null,
    status: error ? '' : landmarker ? READY_MESSAGE : LOADING_MESSAGE,
  }
}