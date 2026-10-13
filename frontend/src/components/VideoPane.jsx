import { useState } from 'react'
import Alert from './ui/Alert'
import Badge from './ui/Badge'
import Button from './ui/Button'
import Icon from './ui/Icon'
import Skeleton from './ui/Skeleton'

const TRACKER_UNAVAILABLE = 'Hand tracking unavailable'

function VideoPane({
  videoRef,
  canvasRef,
  stageRef,
  layerRef,
  fileInputRef,
  isReady,
  isRunning,
  isCameraSource,
  isUploadSource,
  isCameraStarting,
  uploadName,
  trackerFailed,
  statusText,
  modelPhase,
  modelMessage,
  errorText,
  featureDebugLine,
  signDebugLine,
  devThreshold,
  devStreak,
  topPredictions,
  onDevThresholdChange,
  onDevStreakChange,
  onDevReset,
  onUseCamera,
  onStopCamera,
  onUploadClick,
  onFileChange,
  onRemoveUpload,
  onFileDrop,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [tipsOpen, setTipsOpen] = useState(false)

  const trackerTone = trackerFailed ? 'error' : isReady ? 'success' : 'neutral'
  const trackerLabel = trackerFailed
    ? TRACKER_UNAVAILABLE
    : isReady
      ? 'Hand tracking ready'
      : statusText || 'Hand tracking loading\u2026'

  const modelTone =
    modelPhase === 'ready'
      ? 'success'
      : modelPhase === 'loading'
        ? 'neutral'
        : 'error'
  const modelLabel =
    modelPhase === 'ready'
      ? 'Sign model ready'
      : modelPhase === 'loading'
        ? 'Loading sign model\u2026'
        : modelMessage || 'Sign model unavailable'

  const cameraOn = isCameraSource && !isCameraStarting
  const cameraStarting = isCameraSource && isCameraStarting

  const showLoadingStage = !isReady && !trackerFailed
  const showEmptyState = !isRunning

  function handleDragOver(event) {
    event.preventDefault()
    if (!isDragging) setIsDragging(true)
  }

  function handleDragLeave(event) {
    event.preventDefault()
    if (isDragging) setIsDragging(false)
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) onFileDrop(file)
  }

  return (
    <section className="pane" aria-labelledby="video-pane-title">
      <div className="pane-header">
        <h2 className="pane-title" id="video-pane-title">
          Sign input
        </h2>
        <div className="chip-row" role="status" aria-live="polite">
          <Badge tone={trackerTone} icon="hand">
            {trackerLabel}
          </Badge>
          <Badge tone={modelTone} icon="model">
            {modelLabel}
          </Badge>
          {(cameraOn || cameraStarting) && (
            <Badge tone={cameraOn ? 'success' : 'neutral'} icon="camera">
              {cameraOn ? 'Camera on' : 'Starting camera\u2026'}
            </Badge>
          )}
        </div>
      </div>

      <div
        className={`video-stage ${isDragging ? 'is-dragging' : ''}`}
        ref={stageRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className={`video-layer ${isCameraSource ? 'is-mirrored' : ''} ${
            isRunning ? 'is-active' : ''
          }`}
          ref={layerRef}
        >
          {/* The Upload button opens this input, so it stays out of the tab
              order; keyboard users use the Upload video button. */}
          <input
            className="visually-hidden"
            id="video-upload"
            type="file"
            accept="video/*"
            ref={fileInputRef}
            onChange={onFileChange}
            disabled={!isReady}
            tabIndex={-1}
            aria-hidden="true"
          />
          <video
            ref={videoRef}
            className="video-frame"
            autoPlay
            playsInline
            muted
            controls={isUploadSource}
            aria-label={
              isCameraSource
                ? 'Live camera preview with hand landmarks drawn on top'
                : 'Uploaded video with hand landmarks drawn on top'
            }
          />
          <canvas ref={canvasRef} className="video-overlay" aria-hidden="true" />
        </div>

        {cameraOn && (
          <div className="live-badge" role="status">
            <span className="live-dot" aria-hidden="true" />
            Live
          </div>
        )}

        {showLoadingStage && (
          <div className="video-empty">
            <Skeleton
              style={{ width: '120px', height: '120px', borderRadius: 'var(--radius-lg)' }}
            />
            <p className="video-empty-title">{'Loading hand tracking\u2026'}</p>
            <p className="video-empty-text">This only takes a moment.</p>
          </div>
        )}

        {!showLoadingStage && showEmptyState && (
          <div className="video-empty">
            <span className="video-empty-icon" aria-hidden="true">
              <Icon name="hand" size="2rem" />
            </span>
            <p className="video-empty-title">Start your camera or upload a video</p>
            <p className="video-empty-text">
              Use the buttons below, or drag and drop a recording into this window.
            </p>
          </div>
        )}

        {isDragging && (
          <div className="drop-hint">
            <Icon name="upload" size="1.2em" ariaHidden />
            Drop the video here to start
          </div>
        )}
      </div>

      <div className="video-toolbar">
        {isCameraSource ? (
          <Button variant="secondary" icon="camera" onClick={onStopCamera} disabled={isCameraStarting}>
            Stop camera
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="camera"
            onClick={onUseCamera}
            disabled={!isReady || isCameraStarting}
          >
            {isCameraStarting ? 'Starting camera\u2026' : 'Use camera'}
          </Button>
        )}

        <Button
          variant="secondary"
          icon="upload"
          onClick={onUploadClick}
          disabled={!isReady || isCameraStarting}
        >
          Upload video
        </Button>

        {isUploadSource && (
          <Button variant="quiet" icon="close" onClick={onRemoveUpload}>
            Remove video
          </Button>
        )}
      </div>

      <p className="privacy-note">
        <Icon name="lock" size="1.05em" ariaHidden />
        Video stays on your device.
      </p>

      <p className="video-helper">
        Keep one or both hands inside the frame, well lit and facing the camera.
      </p>

      {isUploadSource && uploadName && (
        <p className="video-file-name">
          Playing <span className="video-file-name-strong">{uploadName}</span>
        </p>
      )}

      {errorText && (
        <Alert tone="error" title="Fix this to continue" className="video-alert">
          {errorText}
        </Alert>
      )}

      {featureDebugLine && (
        <p className="video-debug" aria-hidden="true">
          {featureDebugLine}
        </p>
      )}

      {signDebugLine && (
        <p className="video-debug" aria-hidden="true">
          {signDebugLine}
        </p>
      )}

      {import.meta.env.DEV && isRunning && (
        <div className="dev-panel">
          <div className="dev-panel-head">
            <span className="dev-panel-title">Recognition debug</span>
            <span className="dev-panel-badge">Dev only</span>
          </div>

          <div className="dev-row">
            <label className="dev-row-label" htmlFor="dev-threshold">
              Confidence threshold
              <span className="dev-row-value">{devThreshold.toFixed(2)}</span>
            </label>
            <input
              id="dev-threshold"
              className="dev-range"
              type="range"
              min="0.3"
              max="1"
              step="0.01"
              value={devThreshold}
              onChange={onDevThresholdChange}
            />
          </div>

          <div className="dev-row">
            <label className="dev-row-label" htmlFor="dev-streak">
              Committed frames
              <span className="dev-row-value">{devStreak}</span>
            </label>
            <input
              id="dev-streak"
              className="dev-range"
              type="range"
              min="1"
              max="30"
              step="1"
              value={devStreak}
              onChange={onDevStreakChange}
            />
          </div>

          <Button variant="quiet" size="small" onClick={onDevReset}>
            Reset to defaults
          </Button>

          <p className="dev-note">
            Changing either value applies immediately from the next frame and restarts the current
            streak.
          </p>

          <ol className="dev-tops" aria-label="Top three predictions, strongest first">
            {topPredictions.length > 0 ? (
              topPredictions.map((item, index) => (
                <li className="dev-top" key={item.index}>
                  <span className="dev-top-rank">{index + 1}</span>
                  <span className="dev-top-label">{item.label}</span>
                  <span className="dev-top-bar" aria-hidden="true">
                    <span
                      className="dev-top-bar-fill"
                      style={{ width: `${Math.round(item.confidence * 100)}%` }}
                    />
                  </span>
                  <span className="dev-top-confidence">{item.confidence.toFixed(2)}</span>
                </li>
              ))
            ) : (
              <li className="dev-top dev-top-empty">Hold a sign to see the top three.</li>
            )}
          </ol>
        </div>
      )}

      <div className="tips">
        <button
          type="button"
          className="btn btn-quiet tips-toggle"
          aria-expanded={tipsOpen}
          aria-controls="good-results-tips"
          onClick={() => setTipsOpen((current) => !current)}
        >
          How to get good results
          <span className="chevron" aria-hidden="true">
            <Icon name="chevron-down" size="1em" />
          </span>
        </button>
        {tipsOpen && (
          <div className="tips-body" id="good-results-tips">
            <ul>
              <li>Sign in good lighting.</li>
              <li>Keep both hands in view.</li>
              <li>Sign slowly and clearly.</li>
              <li>Use a plain background.</li>
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export default VideoPane