import StatusLine from './StatusLine'

function getStatusTone(statusText, errorText, isReady) {
  if (errorText) return 'error'
  if (isReady) return 'ready'
  if (statusText) return 'loading'
  return 'idle'
}

function VideoPane({
  videoRef,
  canvasRef,
  stageRef,
  layerRef,
  isReady,
  isRunning,
  isCameraSource,
  isUploadSource,
  isCameraStarting,
  uploadName,
  statusText,
  errorText,
  featureDebugLine,
  signDebugLine,
  fileInputRef,
  onUseCamera,
  onStopCamera,
  onUploadClick,
  onFileChange,
  onRemoveUpload,
}) {
  const tone = getStatusTone(statusText, errorText, isReady)

  return (
    <section className="pane" aria-labelledby="video-pane-title">
      <div className="pane-header">
        <h2 className="pane-title" id="video-pane-title">
          Video
        </h2>
        <div className="pane-actions">
          {/* The Upload video button opens this input, so it stays out of the tab order. */}
          <input
            className="visually-hidden"
            id="video-upload"
            type="file"
            accept="video/*"
            ref={fileInputRef}
            onChange={onFileChange}
            disabled={!isReady}
            tabIndex={-1}
            aria-label="Choose a video file to translate"
          />

          {isCameraSource ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onStopCamera}
              disabled={isCameraStarting}
            >
              Stop camera
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onUseCamera}
              disabled={!isReady || isCameraStarting}
            >
              {isCameraStarting ? 'Starting camera...' : 'Use camera'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onUploadClick}
            disabled={!isReady || isCameraStarting}
          >
            Upload video
          </button>

          {isUploadSource && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onRemoveUpload}
            >
              Remove video
            </button>
          )}
        </div>
      </div>

      <div className="video-stage" ref={stageRef}>
        <div
          className={`video-layer ${isCameraSource ? 'is-mirrored' : ''} ${
            isRunning ? 'is-active' : ''
          }`}
          ref={layerRef}
        >
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

        {!isRunning && (
          <div className="video-empty">
            <p className="video-empty-title">No video source yet</p>
            <p className="video-empty-text">
              Choose Use camera to sign along live, or Upload video to play a recording.
            </p>
          </div>
        )}
      </div>

      <p className="video-helper">
        Keep one or both hands inside the frame, well lit and facing the camera.
      </p>

      <StatusLine tone={tone}>{errorText || statusText}</StatusLine>

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

      {isUploadSource && uploadName && (
        <p className="video-file-name">
          Playing <span className="video-file-name-strong">{uploadName}</span>
        </p>
      )}
    </section>
  )
}

export default VideoPane