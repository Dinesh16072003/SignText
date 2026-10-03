import { useCallback, useEffect, useRef } from 'react'
import { extractHandFeatures } from '../services/handFeatures'

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const HAND_COLORS = [
  { line: '#1f5fd0', point: '#123f8c' },
  { line: '#0f7a58', point: '#0a5a40' },
]

export function drawHand(ctx, hand, width, height, colors) {
  const lineWidth = Math.max(2, width / 320)
  const pointRadius = Math.max(3, width / 220)

  ctx.strokeStyle = colors.line
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.beginPath()

  for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
    const start = hand[startIndex]
    const end = hand[endIndex]
    if (!start || !end) continue
    ctx.moveTo(start.x * width, start.y * height)
    ctx.lineTo(end.x * width, end.y * height)
  }

  ctx.stroke()

  ctx.fillStyle = colors.point
  for (const point of hand) {
    ctx.beginPath()
    ctx.arc(point.x * width, point.y * height, pointRadius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Runs Hand Landmarker detection on every new video frame and draws the
 * landmarks on a canvas that sits exactly on top of the video. The same code
 * path handles the live camera and an uploaded video file.
 *
 * Every frame is also converted into the model's input numbers. Only the
 * latest frame is kept, so memory use does not grow with the video length.
 * Nothing is recognized yet.
 */
export function useFrameProcessor({
  landmarker,
  videoRef,
  canvasRef,
  layerRef,
  stageRef,
  isRunning,
  onFrameFeatures,
}) {
  const animationRef = useRef(null)
  const lastTimeRef = useRef(-1)
  const sizeRef = useRef({ width: 0, height: 0 })
  const featuresRef = useRef(null)
  const onFrameFeaturesRef = useRef(onFrameFeatures)
  const metricsRef = useRef({
    videoWidth: 0,
    videoHeight: 0,
    stageWidth: 0,
    stageHeight: 0,
    appliedWidth: 0,
    appliedHeight: 0,
  })

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }, [canvasRef])

  const stop = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    lastTimeRef.current = -1
  }, [])

  // Reading the callback through a ref keeps the detection effect from
  // restarting every time the page re-renders with a new callback.
  useEffect(() => {
    onFrameFeaturesRef.current = onFrameFeatures
  }, [onFrameFeatures])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const layer = layerRef.current
    const stage = stageRef.current

    if (!isRunning || !landmarker || !video || !canvas || !layer || !stage) {
      stop()
      return
    }

    const ctx = canvas.getContext('2d')
    const metrics = metricsRef.current
    metrics.videoWidth = 0
    metrics.videoHeight = 0
    metrics.appliedWidth = 0
    metrics.appliedHeight = 0

    let running = true

    const measureStage = () => {
      const rect = stage.getBoundingClientRect()
      const style = getComputedStyle(stage)
      metrics.stageWidth = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      metrics.stageHeight = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    }

    // Size the video layer to the shape of the video so the video fills it
    // exactly. That keeps the canvas aligned with the video at any size.
    const applyLayerSize = () => {
      const { videoWidth, videoHeight, stageWidth, stageHeight } = metrics

      if (!videoWidth || !videoHeight || !stageWidth || !stageHeight) {
        if (metrics.appliedWidth !== 0 || metrics.appliedHeight !== 0) {
          layer.style.width = '0px'
          layer.style.height = '0px'
          metrics.appliedWidth = 0
          metrics.appliedHeight = 0
        }
        return
      }

      const scale = Math.min(stageWidth / videoWidth, stageHeight / videoHeight)
      const width = Math.max(1, Math.floor(videoWidth * scale))
      const height = Math.max(1, Math.floor(videoHeight * scale))

      if (width === metrics.appliedWidth && height === metrics.appliedHeight) return

      layer.style.width = `${width}px`
      layer.style.height = `${height}px`
      metrics.appliedWidth = width
      metrics.appliedHeight = height
    }

    const syncSizes = () => {
      const videoWidth = video.videoWidth
      const videoHeight = video.videoHeight

      if (videoWidth !== metrics.videoWidth || videoHeight !== metrics.videoHeight) {
        metrics.videoWidth = videoWidth
        metrics.videoHeight = videoHeight

        if (videoWidth && videoHeight) {
          canvas.width = videoWidth
          canvas.height = videoHeight
          sizeRef.current = { width: videoWidth, height: videoHeight }
        }

        applyLayerSize()
      }

      return videoWidth > 0 && videoHeight > 0 && metrics.appliedWidth > 0
    }

    const draw = (results) => {
      const { width, height } = sizeRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const hands = results?.landmarks ?? []
      hands.forEach((hand, index) => {
        drawHand(ctx, hand, width, height, HAND_COLORS[index % HAND_COLORS.length])
      })

      // Only the newest frame is kept. There is no queue and no history.
      featuresRef.current = extractHandFeatures(results)
      onFrameFeaturesRef.current?.({
        handCount: hands.length,
        features: featuresRef.current,
      })
    }

    const detectFrame = () => {
      if (!running) return
      animationRef.current = requestAnimationFrame(detectFrame)

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      if (!syncSizes()) return
      if (video.currentTime === lastTimeRef.current) return

      lastTimeRef.current = video.currentTime

      try {
        draw(landmarker.detectForVideo(video, Math.round(performance.now())))
      } catch (detectError) {
        console.error('Hand detection failed for this frame:', detectError)
      }
    }

    measureStage()
    applyLayerSize()

    const resizeObserver = new ResizeObserver(() => {
      measureStage()
      applyLayerSize()
    })
    resizeObserver.observe(stage)

    // The video reports its size once metadata or the camera stream arrives.
    const refreshSizes = () => {
      measureStage()
      syncSizes()
    }
    video.addEventListener('loadedmetadata', refreshSizes)
    video.addEventListener('resize', refreshSizes)

    animationRef.current = requestAnimationFrame(detectFrame)

    return () => {
      running = false
      resizeObserver.disconnect()
      video.removeEventListener('loadedmetadata', refreshSizes)
      video.removeEventListener('resize', refreshSizes)
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      lastTimeRef.current = -1
      sizeRef.current = { width: 0, height: 0 }
      featuresRef.current = null
      clearCanvas()
    }
  }, [landmarker, videoRef, canvasRef, layerRef, stageRef, isRunning, stop, clearCanvas])

  return { stop, clearCanvas, latestFeatures: featuresRef }
}