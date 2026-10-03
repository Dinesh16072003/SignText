import { useCallback, useEffect, useRef, useState } from 'react'
import { useHandTracker } from '../hooks/useHandTracker'
import { describeCameraError, useCamera } from '../hooks/useCamera'
import { useFrameProcessor } from '../hooks/useFrameProcessor'
import { FEATURE_LENGTH } from '../services/handFeatures'
import VideoPane from '../components/VideoPane'
import TextPane from '../components/TextPane'

const VIDEO_FILE_PATTERN = /\.(mp4|mov|webm|ogv|m4v)$/i
const UNSUPPORTED_FILE_MESSAGE =
  'That file is not a video Signtext can play. Choose a video file such as MP4, MOV or WebM, then try again.'

function Translate() {
  const [source, setSource] = useState(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [detectedHands, setDetectedHands] = useState(0)
  const detectedHandsRef = useRef(0)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const layerRef = useRef(null)
  const fileInputRef = useRef(null)
  const uploadUrlRef = useRef('')

  const { landmarker, status: trackerStatus, error: trackerError, isReady } =
    useHandTracker()
  const {
    start: startCamera,
    stop: stopCamera,
    error: cameraError,
    clearError: clearCameraError,
    isStarting: isCameraStarting,
  } = useCamera()

  const isCameraSource = source === 'camera'
  const isUploadSource = source === 'upload'
  const isRunning = isCameraSource || isUploadSource
  const textSource = isCameraSource ? 'live' : isUploadSource ? 'upload' : null

  // Runs on every detected frame. React only hears about it when the number of
  // hands changes, so the page is not re-rendered at video speed.
  const handleFrameFeatures = useCallback(({ handCount }) => {
    if (handCount === detectedHandsRef.current) return
    detectedHandsRef.current = handCount
    setDetectedHands(handCount)
  }, [])

  useFrameProcessor({
    landmarker,
    videoRef,
    canvasRef,
    layerRef,
    stageRef,
    isRunning: isRunning && isReady,
    onFrameFeatures: handleFrameFeatures,
  })

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
          onUseCamera={handleUseCamera}
          onStopCamera={handleStopCamera}
          onUploadClick={handleUploadClick}
          onFileChange={handleFileChange}
          onRemoveUpload={handleRemoveUpload}
        />

        <TextPane source={textSource} />
      </div>
    </main>
  )
}

export default Translate