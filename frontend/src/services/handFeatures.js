/**
 * Turns the landmarks of one video frame into the fixed length number list
 * that the recognition model will read. This module is pure: no React, no
 * camera, no model. The same code runs in the browser and in the Python
 * training pipeline through ml/FEATURE_SPEC.md, which is the contract both
 * sides follow.
 */

export const LANDMARK_COUNT = 21
export const VALUES_PER_LANDMARK = 3
export const FEATURES_PER_HAND = LANDMARK_COUNT * VALUES_PER_LANDMARK
export const HAND_SLOT_COUNT = 2
export const FEATURE_LENGTH = FEATURES_PER_HAND * HAND_SLOT_COUNT

// Number of frames that make up one model input. This is 1 for letter level
// signs. Change it to 30 for word level signs and every consumer of the
// features must multiply by it.
export const WINDOW_LENGTH = 1

// Guards against dividing by zero when a hand is so small that its middle
// finger base sits on top of its wrist.
export const MIN_SCALE = 1e-6

const WRIST_INDEX = 0
const MIDDLE_FINGER_BASE_INDEX = 9
const ZERO_SLOT = new Array(FEATURES_PER_HAND).fill(0)

function distance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Normalizes one hand into 63 numbers: every landmark minus the wrist, then
 * divided by the wrist to middle finger base distance. Landmarks are written
 * in MediaPipe index order as x, y, z.
 */
function handToFeatures(hand) {
  const wrist = hand[WRIST_INDEX]
  const scale = Math.max(distance(wrist, hand[MIDDLE_FINGER_BASE_INDEX]), MIN_SCALE)

  const features = []
  for (let index = 0; index < LANDMARK_COUNT; index += 1) {
    const landmark = hand[index]
    features.push(
      (landmark.x - wrist.x) / scale,
      (landmark.y - wrist.y) / scale,
      (landmark.z - wrist.z) / scale
    )
  }

  return features
}

/**
 * Reads one Hand Landmarker result and returns FEATURE_LENGTH numbers, or
 * null when no hands are visible in that frame.
 *
 * Hands are placed left to right by the horizontal position of their wrists,
 * ignoring the handedness label MediaPipe reports. A hand that is missing
 * leaves its slot as zeros.
 */
export function extractHandFeatures(result) {
  const hands = result?.landmarks ?? []
  if (hands.length === 0) return null

  // Copy before sorting so the caller's result is never reordered.
  const ordered = [...hands].sort((a, b) => a[WRIST_INDEX].x - b[WRIST_INDEX].x)
  const features = []

  for (let slot = 0; slot < HAND_SLOT_COUNT; slot += 1) {
    const hand = ordered[slot]
    if (!hand) {
      features.push(...ZERO_SLOT)
      continue
    }
    features.push(...handToFeatures(hand))
  }

  return features
}