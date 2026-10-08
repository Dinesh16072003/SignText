import { useCallback, useEffect, useRef, useState } from 'react'
import { useHandTracker } from '../hooks/useHandTracker'
import { describeCameraError, useCamera } from '../hooks/useCamera'
import { useFrameProcessor } from '../hooks/useFrameProcessor'
import { useSignModel } from '../hooks/useSignModel'
import { FEATURE_LENGTH } from '../services/handFeatures'
import { applyCommit, createSignSmoother } from '../services/signSmoother'
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
  const detectedHandsRef = useRef(0)

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
  } = useSignModel()

  const isCameraSource = source === 'camera'
  const isUploadSource = source === 'upload'
  const isRunning = isCameraSource || isUploadSource
  const textSource = isCameraSource ? 'live' : isUploadSource ? 'upload' : null

  const refreshDebug = useCallback(() => {
    const now = performance.now()
    if (now - debugAtRef.current < DEBUG_REFRESH_MS) return
    debugAtRef.current = now
    setDebugState(smootherRef.current.getDebugState())
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

      const prediction = features ? predict(features) : null
      const committed = smootherRef.current.push({
        label: prediction?.label ?? null,
        confidence: prediction?.confidence ?? 0,
        time: performance.now(),
      })

      if (committed) setText((current) => applyCommit(current, committed))
      if (import.meta.env.DEV) refreshDebug()
    },
    [isModelReady, predict, refreshDebug]
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
  }, [source])

  const handleTextChange = useCallback((value) => setText(value), [])

  const handleClearText = useCallback(() => {
    setText('')
    smootherRef.current.reset()
    debugAtRef.current = 0
    if (import.meta.env.DEV) setDebugState(smootherRef.current.getDebugState())
  }, [])


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

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files?.[0]
      if (!file) return

      const looksLikeVideo = file.type.startsWith('video/') || VIDEO_FILE_PATTERN.test(file.name)

      if (!looksLikeVideo) {
        setUploadError(UNSUPPORTED_FILE_MESSAGE)
        event.target.value = ''
        return
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
    },
    [stopCamera, clearCameraError, releaseUpload]
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
          statusText={trackerStatus}
          errorText={message}
          featureDebugLine={featureDebugLine}
          signDebugLine={signDebugLine}
          onUseCamera={handleUseCamera}
          onStopCamera={handleStopCamera}
          onUploadClick={handleUploadClick}
          onFileChange={handleFileChange}
          onRemoveUpload={handleRemoveUpload}
        />

        <TextPane
          source={textSource}
          text={text}
          onTextChange={handleTextChange}
          onClear={handleClearText}
          modelStatus={modelStatus}
        />
      </div>
    </main>
  )
}

export default Translate