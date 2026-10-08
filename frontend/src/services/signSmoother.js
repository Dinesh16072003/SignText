/**
 * Decides when a model prediction becomes a letter in the text pane.
 *
 * The model answers every frame, and one frame on its own is noise: the
 * confidence wobbles and the class flickers. This module turns that stream
 * into whole letters. It holds no React and no TensorFlow, so the rules can
 * be tested with made up sequences.
 *
 * The three rules, as tunable constants:
 *
 *   CONFIDENCE_THRESHOLD  frames below this confidence are ignored.
 *   COMMIT_STREAK         consecutive confident frames of one class before
 *                         it becomes a letter.
 *   REPEAT_HOLD_MS        how steadily a class must be held before the same
 *                         letter may be committed a second time.
 *
 * A committed class may only be committed again when
 *
 *   1. the hands left the frame after it was committed, or
 *   2. the prediction changed to a different class and came back, or
 *   3. the same class has been held steadily for REPEAT_HOLD_MS.
 *
 * Rule 1 is the one that makes typing double letters natural: sign L, take
 * the hand out of frame, sign L again, as in the two L's of HELLO. Rule 2
 * covers signing a different letter in between, which is how most words are
 * spelled anyway. Rule 3 is the fallback for a signer who keeps the hand up
 * and holds the same sign for a long time, so a stuck frame can never type
 * the same letter forever.
 */

export const CONFIDENCE_THRESHOLD = 0.8
export const COMMIT_STREAK = 8
export const REPEAT_HOLD_MS = 1500

export const SPACE_CLASS = 'space'
export const DELETE_CLASS = 'del'

/**
 * Applies one committed class to the text. space adds a space, del removes
 * the last character, and every other class prints itself in capitals.
 * Neither special class ever adds its own name.
 */
export function applyCommit(text, className) {
  if (className === SPACE_CLASS) return `${text} `
  if (className === DELETE_CLASS) return text.slice(0, -1)
  return text + String(className).toUpperCase()
}

/**
 * Creates a fresh smoothing state machine. Options exist for the tests; the
 * defaults are the constants above.
 */
export function createSignSmoother({
  threshold = CONFIDENCE_THRESHOLD,
  streak = COMMIT_STREAK,
  holdMs = REPEAT_HOLD_MS,
} = {}) {
  // The run currently being counted.
  let pendingLabel = null
  let pendingCount = 0
  // When the current steady run of pendingLabel began, for the hold rule.
  // null means no run is in progress, which is not the same as time 0.
  let steadySince = null

  let lastCommitted = null
  let repeatReady = false

  // Last frame seen, for the developer overlay.
  let topLabel = null
  let topConfidence = 0

  function clearRun() {
    pendingLabel = null
    pendingCount = 0
    steadySince = null
  }

  /**
   * Takes one frame: { label, confidence, time }. label is null when no hand
   * is in the frame. Returns the committed class name, or null.
   */
  function push({ label = null, confidence = 0, time = 0 } = {}) {
    topLabel = label
    topConfidence = label ? confidence : 0

    // Hands left the frame. That ends the run and frees the last letter to be
    // signed again.
    if (!label) {
      clearRun()
      repeatReady = true
      return null
    }

    // Below the threshold the frame is ignored. It does not count towards the
    // streak, and because it breaks the run, the streak after it starts again
    // from zero. The hands are still in frame, so it does not free a repeat.
    if (confidence < threshold) {
      clearRun()
      return null
    }

    if (label !== pendingLabel) {
      pendingLabel = label
      pendingCount = 1
      steadySince = time
    } else {
      pendingCount += 1
    }

    // Seeing a class other than the one last committed arms rule 2.
    if (lastCommitted !== null && label !== lastCommitted) {
      repeatReady = true
    }

    if (pendingCount < streak) return null

    const heldLongEnough = steadySince !== null && time - steadySince >= holdMs
    if (lastCommitted === label && !repeatReady && !heldLongEnough) return null

    // Committed. The hold clock restarts so the next repeat of this class
    // needs its own steady hold.
    if (heldLongEnough) steadySince = time
    lastCommitted = label
    repeatReady = false
    pendingCount = 0

    return label
  }

  function reset() {
    clearRun()
    lastCommitted = null
    repeatReady = false
    topLabel = null
    topConfidence = 0
  }

  function getDebugState() {
    return {
      label: topLabel,
      confidence: topConfidence,
      streak: pendingCount,
      lastCommitted,
      repeatReady,
    }
  }

  return { push, reset, getDebugState }
}
