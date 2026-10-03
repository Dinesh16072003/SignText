import { describe, expect, it } from 'vitest'
import {
  FEATURE_LENGTH,
  FEATURES_PER_HAND,
  HAND_SLOT_COUNT,
  MIN_SCALE,
  WINDOW_LENGTH,
  extractHandFeatures,
} from './handFeatures'

// Built with a different step per axis so a mixed up x, y or z is caught.
const STEP = { x: 0.01, y: 0.02, z: 0.03 }
const MIDDLE_FINGER_BASE_INDEX = 9

// Builds a made up hand whose wrist sits at wristX.
function makeFakeHand(wristX, wristY = 0.5, wristZ = 0) {
  return Array.from({ length: 21 }, (_, index) => ({
    x: wristX + index * STEP.x,
    y: wristY + index * STEP.y,
    z: wristZ + index * STEP.z,
  }))
}

const fakeMiddleFingerBaseScale = () =>
  Math.sqrt(
    (MIDDLE_FINGER_BASE_INDEX * STEP.x) ** 2 +
      (MIDDLE_FINGER_BASE_INDEX * STEP.y) ** 2 +
      (MIDDLE_FINGER_BASE_INDEX * STEP.z) ** 2
  )

function makeFakeResult(hands) {
  return {
    landmarks: hands,
    worldLandmarks: [],
    handedness: hands.map(() => [{ categoryName: 'Right', score: 0.99 }]),
  }
}

function distance(values) {
  return Math.sqrt(
    values.reduce((total, value) => total + value * value, 0)
  )
}

const wristOf = (features, slot = 0) =>
  features.slice(slot * FEATURES_PER_HAND, slot * FEATURES_PER_HAND + 3)

const middleFingerBaseOf = (features, slot = 0) => {
  const start = slot * FEATURES_PER_HAND + 9 * 3
  return features.slice(start, start + 3)
}

describe('extractHandFeatures', () => {
  it('reports the shape the model expects', () => {
    expect(FEATURES_PER_HAND).toBe(63)
    expect(HAND_SLOT_COUNT).toBe(2)
    expect(FEATURE_LENGTH).toBe(126)
    expect(WINDOW_LENGTH).toBe(1)
  })

  it('returns nothing when no hands are visible', () => {
    expect(extractHandFeatures(makeFakeResult([]))).toBeNull()
    expect(extractHandFeatures({ landmarks: [] })).toBeNull()
  })

  it('always returns 126 numbers', () => {
    const features = extractHandFeatures(makeFakeResult([makeFakeHand(0.2)]))

    expect(features).toHaveLength(FEATURE_LENGTH)
    expect(features.every((value) => typeof value === 'number')).toBe(true)
  })

  it('fills only the first slot when one hand is visible', () => {
    const features = extractHandFeatures(makeFakeResult([makeFakeHand(0.4)]))

    const firstSlot = features.slice(0, FEATURES_PER_HAND)
    const secondSlot = features.slice(FEATURES_PER_HAND)

    expect(firstSlot.some((value) => value !== 0)).toBe(true)
    expect(secondSlot).toHaveLength(FEATURES_PER_HAND)
    expect(secondSlot.every((value) => value === 0)).toBe(true)
  })

  it('orders two hands by the horizontal position of their wrists', () => {
    const leftHand = makeFakeHand(0.2)
    const rightHand = makeFakeHand(0.7)

    const features = extractHandFeatures(makeFakeResult([rightHand, leftHand]))
    const leftOnly = extractHandFeatures(makeFakeResult([leftHand]))
    const rightOnly = extractHandFeatures(makeFakeResult([rightHand]))

    // Handedness labels disagree with the positions on purpose.
    expect(features.slice(0, FEATURES_PER_HAND)).toEqual(leftOnly.slice(0, FEATURES_PER_HAND))
    expect(features.slice(FEATURES_PER_HAND)).toEqual(rightOnly.slice(0, FEATURES_PER_HAND))
  })

  it('moves the wrist to the origin of each slot', () => {
    const features = extractHandFeatures(
      makeFakeResult([makeFakeHand(0.6, 0.3, -0.2), makeFakeHand(0.15)])
    )

    for (const slot of [0, 1]) {
      expect(wristOf(features, slot)).toEqual([0, 0, 0])
    }
  })

  it('divides each hand by its own wrist to middle finger distance', () => {
    const features = extractHandFeatures(makeFakeResult([makeFakeHand(0.2)]))
    const scale = fakeMiddleFingerBaseScale()

    // The scale is the distance the hand was measured in, so the normalized
    // vector for that landmark always has length 1.
    expect(distance(middleFingerBaseOf(features))).toBeCloseTo(1, 10)

    const offsets = [STEP.x, STEP.y, STEP.z].map((step) => MIDDLE_FINGER_BASE_INDEX * step)
    middleFingerBaseOf(features).forEach((value, axis) => {
      expect(value).toBeCloseTo(offsets[axis] / scale, 10)
    })
  })

  it('scales each hand on its own size', () => {
    const smallHand = makeFakeHand(0.2)
    const largeHand = makeFakeHand(0.2).map((landmark) => ({
      x: landmark.x * 2,
      y: landmark.y * 2,
      z: landmark.z * 2,
    }))

    const small = extractHandFeatures(makeFakeResult([smallHand]))
    const large = extractHandFeatures(makeFakeResult([largeHand]))

    expect(small).toEqual(large)
  })

  it('keeps a collapsed hand finite instead of dividing by zero', () => {
    const collapsed = Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.5, z: 0 }))
    const features = extractHandFeatures(makeFakeResult([collapsed]))

    expect(features).toHaveLength(FEATURE_LENGTH)
    expect(features.every((value) => Number.isFinite(value))).toBe(true)
    expect(MIN_SCALE).toBeGreaterThan(0)
  })

  it('leaves the result it was given untouched', () => {
    const hands = [makeFakeHand(0.7), makeFakeHand(0.2)]
    const result = makeFakeResult(hands)
    const originalOrder = [result.landmarks[0][0].x, result.landmarks[1][0].x]

    extractHandFeatures(result)

    expect([result.landmarks[0][0].x, result.landmarks[1][0].x]).toEqual(originalOrder)
  })
})