import { useCallback, useEffect, useRef, useState } from 'react'
import { useHandTracker } from '../hooks/useHandTracker'
import { describeCameraError, useCamera } from '../hooks/useCamera'
import { useFrameProcessor } from '../hooks/useFrameProcessor'
import { useSignModel } from '../hooks/useSignModel'
import { usePageTitle } from '../hooks/usePageTitle'
import { FEATURE_LENGTH } from '../services/handFeatures'
import {
  COMMIT_STREAK,
  CONFIDENCE_THRESHOLD,
  applyCommit,
  createSignSmoother,
} from '../services/signSmoother'
import VideoPane from '../components/VideoPane'
import TextPane from '../components/TextPane'

const VIDEO_FILE_PATTERN = /\.(mp4|mov|webm|ogv|m4v)$/i
const UNSUPPORTED_FILE_MESSAGE =
  'That file is not a video Signtext can play. Choose a video file such as MP4, MOV or WebM, then try again.'

// How often the developer overlay refreshes. The model answers every frame,
// and re-rendering the page at video speed would only slow it down.
const DEBUG_REFRESH_MS = 100

const MODEL_TONE = {
  loading: 'loading',
  ready: 'ready',
  missing: 'error',
  error: 'error',
}

function Translate() {
  usePageTitle('Translate')

  const [source, setSource] = useState(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [detectedHands, setDetectedHands] = useState(0)
  const [text, setText] = useState('')
  const [debugState, setDebugState] = useState(() => ({
    label: null,
    confidence: 0,
    streak: 0,
  }))
  // Developer-only tuning: live threshold and streak for the smoother, and the
  // top three candidates of the last frame. Nothing here is shown or changed
  // in a production build.
  const [devThreshold, setDevThreshold] = useState(CONFIDENCE_THRESHOLD)
  const [devStreak, setDevStreak] = useState(COMMIT_STREAK)
  const [topPredictions, setTopPredictions] = useState([])
  const detectedHandsRef = useRef(0)
  const topPredictionsRef = useRef([])

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const layerRef = useRef(null)
  const fileInputRef = useRef(null)
  const uploadUrlRef = useRef('')
  const smootherRef = useRef(null)
  const debugAtRef = useRef(0)

  if (smootherRef.current === null) smootherRef.current = createSignSmoother()

  const { landmarker, status: trackerStatus, error: trackerError, isReady } =
    useHandTracker()
  const {
    start: startCamera,
    stop: stopCamera,
    error: cameraError,
    clearError: clearCameraError,
    isStarting: isCameraStarting,
  } = useCamera()
  const {
    phase: modelPhase,
    message: modelMessage,
    isReady: isModelReady,
    predict,
    predictTop,
    retry: retryModel,
  } = useSignModel()

  const handleRetryModel = useCallback(() => retryModel(), [retryModel])

  const isCameraSource = source === 'camera'
  const isUploadSource = source === 'upload'
  const isRunning = isCameraSource || isUploadSource
  const textSource = isCameraSource ? 'live' : isUploadSource ? 'upload' : null

  const refreshDebug = useCallback(() => {
    const now = performance.now()
    if (now - debugAtRef.current < DEBUG_REFRESH_MS) return
    debugAtRef.current = now
    setDebugState(smootherRef.current.getDebugState())
    if (import.meta.env.DEV) setTopPredictions(topPredictionsRef.current)
  }, [])

  // Runs on every detected frame. React only hears about it when the number
  // of hands changes or when a letter is committed, so the page is not
  // re-rendered at video speed.
  const handleFrameFeatures = useCallback(
    ({ handCount, features }) => {
      if (handCount !== detectedHandsRef.current) {
        detectedHandsRef.current = handCount
        setDetectedHands(handCount)
      }

      // Without a loaded model there is no prediction at all: the status line
      // explains what is happening and the text stays untouched.
      if (!isModelReady) return

      // One model read per frame, however it is consumed. In development the
      // read is the top-three list, whose first entry drives the smoother
      // exactly like the standalone top prediction does in production, so the
      // debug overlay never shows a different answer than the one that typed
      // the letter.
      let best = null
      if (features) {
        if (import.meta.env.DEV) {
          topPredictionsRef.current = predictTop(features)
          best = topPredictionsRef.current[0] ?? null
        } else {
          best = predict(features)
        }
      } else if (import.meta.env.DEV) {
        topPredictionsRef.current = []
      }

      const committed = smootherRef.current.push({
        label: best?.label ?? null,
        confidence: best?.confidence ?? 0,
        time: performance.now(),
      })

      if (committed) setText((current) => applyCommit(current, committed))
      if (import.meta.env.DEV) refreshDebug()
    },
    [isModelReady, predict, predictTop, refreshDebug]
  )

  useFrameProcessor({
    landmarker,
    videoRef,
    canvasRef,
    layerRef,
    stageRef,
    isRunning: isRunning && isReady,
    onFrameFeatures: handleFrameFeatures,
  })

  // A new video source starts a fresh typing session, so a half typed word
  // from the last one cannot leak into this one.
  useEffect(() => {
    smootherRef.current.reset()
    debugAtRef.current = 0
    if (import.meta.env.DEV) setDebugState(smootherRef.current.getDebugState())
    if (import.meta.env.DEV) {
      topPredictionsRef.current = []
      setTopPredictions([])
    }
  }, [source])

  const handleTextChange = useCallback((value) => setText(value), [])

  const handleClearText = useCallback(() => {
    setText('')
    smootherRef.current.reset()
    debugAtRef.current = 0
    if (import.meta.env.DEV) setDebugState(smootherRef.current.getDebugState())
    if (import.meta.env.DEV) {
      topPredictionsRef.current = []
      setTopPredictions([])
    }
  }, [])

  // Developer-only handles: changing a value swaps in a fresh smoother, which
  // resets any streak in progress, so the new rule applies from the very next
  // frame. Production never touches these: the controls only exist in
  // development and the smoother keeps the documented defaults.
  const applyDevSettings = useCallback((threshold, streak) => {
    smootherRef.current = createSignSmoother({ threshold, streak })
    debugAtRef.current = 0
    topPredictionsRef.current = []
    setTopPredictions([])
    setDebugState(smootherRef.current.getDebugState())
  }, [])

  const handleDevThresholdChange = useCallback(
    (event) => {
      const threshold = Number(event.target.value)
      setDevThreshold(threshold)
      applyDevSettings(threshold, devStreak)
    },
    [applyDevSettings, devStreak]
  )

  const handleDevStreakChange = useCallback(
    (event) => {
      const streak = Number(event.target.value)
      setDevStreak(streak)
      applyDevSettings(devThreshold, streak)
    },
    [applyDevSettings, devThreshold]
  )

  const handleDevReset = useCallback(() => {
    setDevThreshold(CONFIDENCE_THRESHOLD)
    setDevStreak(COMMIT_STREAK)
    applyDevSettings(CONFIDENCE_THRESHOLD, COMMIT_STREAK)
  }, [applyDevSettings])

  const releaseUpload = useCallback(() => {
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current)
      uploadUrlRef.current = ''
    }
    setUploadName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Stop detection and release the camera whenever the page is left.
  useEffect(() => {
    return () => {
      stopCamera()
      if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current)
    }
  }, [stopCamera])

  const handleUseCamera = useCallback(async () => {
    setUploadError('')
    const result = await startCamera()
    if (!result.ok) return

    const video = videoRef.current
    releaseUpload()
    setSource('camera')

    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.srcObject = result.stream
      video.loop = false
      video.controls = false
      await video.play().catch(() => {})
    }
  }, [startCamera, releaseUpload])

  const handleStopCamera = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    stopCamera()
    setSource(null)
  }, [stopCamera])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Shared by the picker and drag-and-drop; returns whether the file is going
  // to play. Nothing about recognition changes here, only which video feeds in.
  const processFile = useCallback(
    (file) => {
      if (!file) return false

      const looksLikeVideo = file.type.startsWith('video/') || VIDEO_FILE_PATTERN.test(file.name)

      if (!looksLikeVideo) {
        setUploadError(UNSUPPORTED_FILE_MESSAGE)
        return false
      }

      setUploadError('')
      clearCameraError()
      stopCamera()

      const url = URL.createObjectURL(file)
      const video = videoRef.current

      if (video) {
        video.pause()
        video.srcObject = null
        video.src = url
        video.loop = false
        video.controls = true
      }

      releaseUpload()
      uploadUrlRef.current = url
      setUploadName(file.name)
      setSource('upload')
      return true
    },
    [stopCamera, clearCameraError, releaseUpload]
  )

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      if (!processFile(file)) event.target.value = ''
    },
    [processFile]
  )

  const handleRemoveUpload = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    releaseUpload()
    setSource(null)
  }, [releaseUpload])

  const message = cameraError
    ? describeCameraError(cameraError)
    : uploadError || trackerError

  // Only visible while developing, so the built app stays clean.
  const featureDebugLine =
    import.meta.env.DEV && isRunning
      ? `hands: ${detectedHands}, features: ${FEATURE_LENGTH}`
      : ''

  const signDebugLine =
    import.meta.env.DEV && isRunning
      ? `model: ${debugState.label ?? 'none'}, confidence: ${debugState.confidence.toFixed(2)}, streak: ${debugState.streak}`
      : ''

  const modelStatus = {
    tone: MODEL_TONE[modelPhase] ?? 'idle',
    text: modelMessage,
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">Translate</h1>
        <p className="page-subtitle">Turn American Sign Language into text as you sign.</p>
      </header>

      <div className="pane-grid">
        <VideoPane
          videoRef={videoRef}
          canvasRef={canvasRef}
          stageRef={stageRef}
          layerRef={layerRef}
          fileInputRef={fileInputRef}
          isReady={isReady}
          isRunning={isRunning}
          isCameraSource={isCameraSource}
          isUploadSource={isUploadSource}
          isCameraStarting={isCameraStarting}
          uploadName={uploadName}
          trackerFailed={Boolean(trackerError)}
          statusText={trackerStatus}
          modelPhase={modelPhase}
          modelMessage={modelMessage}
          errorText={message}
          featureDebugLine={featureDebugLine}
          signDebugLine={signDebugLine}
          devThreshold={devThreshold}
          devStreak={devStreak}
          topPredictions={topPredictions}
          onDevThresholdChange={handleDevThresholdChange}
          onDevStreakChange={handleDevStreakChange}
          onDevReset={handleDevReset}
          onUseCamera={handleUseCamera}
          onStopCamera={handleStopCamera}
          onUploadClick={handleUploadClick}
          onFileChange={handleFileChange}
          onFileDrop={processFile}
          onRemoveUpload={handleRemoveUpload}
        />

        <TextPane
          source={textSource}
          text={text}
          onTextChange={handleTextChange}
          onClear={handleClearText}
          modelStatus={modelStatus}
          onRetryModel={handleRetryModel}
        />
      </div>
    </main>
  )
}

export default Translate