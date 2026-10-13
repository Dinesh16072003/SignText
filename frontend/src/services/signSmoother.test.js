import { describe, expect, it } from 'vitest'
import {
  COMMIT_STREAK,
  CONFIDENCE_THRESHOLD,
  REPEAT_HOLD_MS,
  applyCommit,
  createSignSmoother,
} from './signSmoother'

// One frame every 33ms, close to a 30fps camera.
const FRAME_MS = 33
const CONFIDENT = 0.95

function frames(label, count, { confidence = CONFIDENT, start = 0 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    label,
    confidence,
    time: start + index * FRAME_MS,
  }))
}

function run(smoother, sequence) {
  return sequence.map((frame) => smoother.push(frame)).filter(Boolean)
}

function runWithTimes(smoother, sequence) {
  return sequence
    .map((frame) => {
      const committed = smoother.push(frame)
      return committed ? { label: committed, time: frame.time } : null
    })
    .filter(Boolean)
}

const noHands = (time) => ({ label: null, confidence: 0, time })

describe('the tuning constants', () => {
  it('are the documented values', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.8)
    expect(COMMIT_STREAK).toBe(8)
    expect(REPEAT_HOLD_MS).toBe(1500)
  })
})

describe('committing a letter', () => {
  it('waits for the full streak of consecutive frames', () => {
    const smoother = createSignSmoother()
    const sequence = frames('H', COMMIT_STREAK)

    expect(run(smoother, sequence.slice(0, COMMIT_STREAK - 1))).toEqual([])
    expect(run(smoother, sequence.slice(COMMIT_STREAK - 1))).toEqual(['H'])
  })

  it('counts a frame exactly on the confidence threshold', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('B', COMMIT_STREAK, { confidence: CONFIDENCE_THRESHOLD }))).toEqual([
      'B',
    ])
  })

  it('never commits while there are no hands', () => {
    const smoother = createSignSmoother()
    expect(smoother.push(noHands(0))).toBeNull()
    expect(run(smoother, [noHands(33), noHands(66)]).length).toBe(0)
  })
})

describe('low confidence frames', () => {
  it('are ignored: they do not count towards the streak', () => {
    const smoother = createSignSmoother()
    const sequence = [...frames('H', COMMIT_STREAK - 1), { label: 'H', confidence: 0.5, time: 700 }]

    expect(run(smoother, sequence)).toEqual([])
  })

  it('break the run, so the streak starts again from zero', () => {
    const smoother = createSignSmoother()
    const before = [...frames('H', COMMIT_STREAK - 1), { label: 'H', confidence: 0.79, time: 700 }]

    expect(run(smoother, before)).toEqual([])
    // Seven more confident frames are still not enough.
    expect(run(smoother, frames('H', COMMIT_STREAK - 1, { start: 800 }))).toEqual([])
    // The eighth one is.
    expect(run(smoother, frames('H', 1, { start: 1100 }))).toEqual(['H'])
  })

  it('do not free a repeat, because the hands never left', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])
    expect(smoother.push({ label: 'L', confidence: 0.4, time: 400 })).toBeNull()
    expect(run(smoother, frames('L', COMMIT_STREAK - 1, { start: 500 }))).toEqual([])
    expect(run(smoother, frames('L', 1, { start: 800 }))).toEqual([])
  })
})

describe('repeating the same letter', () => {
  it('is blocked while the same sign is held, until the hands leave', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])

    // Held for just under the hold time: still only one L.
    const held = frames('L', 30, { start: COMMIT_STREAK * FRAME_MS })
    expect(run(smoother, held)).toEqual([])

    // Hands out of frame, then the same sign again.
    expect(smoother.push(noHands(1300))).toBeNull()
    expect(run(smoother, frames('L', COMMIT_STREAK, { start: 1400 }))).toEqual(['L'])
  })

  it('is allowed after a steady hold of about one and a half seconds', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])

    // From the start of the steady run at t=0, the second commit lands on the
    // first frame at or after 1500ms, which is t=1518.
    const commits = runWithTimes(smoother, frames('L', 70, { start: COMMIT_STREAK * FRAME_MS }))
    expect(commits).toEqual([{ label: 'L', time: 1518 }])
  })

  it('is allowed after the prediction changed to another letter and back', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])

    // One confident frame of a different letter arms the repeat rule.
    expect(run(smoother, frames('E', 1, { start: 300 }))).toEqual([])
    // Coming back still needs a full streak of its own.
    expect(run(smoother, frames('L', COMMIT_STREAK - 1, { start: 400 }))).toEqual([])
    expect(run(smoother, frames('L', 1, { start: 700 }))).toEqual(['L'])
  })

  it('stays blocked when only an ignored frame appears in between', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])
    expect(smoother.push({ label: 'E', confidence: 0.3, time: 400 })).toBeNull()
    expect(run(smoother, frames('L', COMMIT_STREAK, { start: 500 }))).toEqual([])
  })
})

describe('live tuning options, used by the developer panel', () => {
  it('loosens a lower-confidence sign into a letter', () => {
    const sequence = frames('A', 3, { confidence: 0.62 })

    // The defaults (0.8 / 8) never commit this: every frame is ignored.
    expect(run(createSignSmoother(), sequence)).toEqual([])

    const tuned = run(createSignSmoother({ threshold: 0.6, streak: 3 }), sequence)
    expect(tuned).toEqual(['A'])
  })

  it('tightens, so a sign must be held longer and more steadily', () => {
    const smoother = createSignSmoother({ threshold: 0.85, streak: 12 })
    expect(run(smoother, frames('B', COMMIT_STREAK))).toEqual([])
    expect(run(smoother, frames('B', 4, { start: COMMIT_STREAK * FRAME_MS }))).toEqual(['B'])
  })

  it('keeps the documented defaults when created without options', () => {
    expect(run(createSignSmoother(), frames('C', COMMIT_STREAK, { confidence: 0.8 }))).toEqual([
      'C',
    ])
  })
})

describe('space and del', () => {
  it('are committed like any other class', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('space', COMMIT_STREAK))).toEqual(['space'])

    expect(smoother.push(noHands(400))).toBeNull()
    expect(run(smoother, frames('del', COMMIT_STREAK, { start: 500 }))).toEqual(['del'])
  })

  it('change the text without ever writing their own name', () => {
    expect(applyCommit('HEL', 'space')).toBe('HEL ')
    expect(applyCommit('HELLO ', 'del')).toBe('HELLO')
    expect(applyCommit('HELLO', 'del')).toBe('HELL')
    expect(applyCommit('', 'del')).toBe('')
    expect(applyCommit('', 'space')).toBe(' ')
  })

  it('print letters in capitals', () => {
    expect(applyCommit('', 'h')).toBe('H')
    expect(applyCommit('HE', 'l')).toBe('HEL')
  })
})

describe('reset, which is what the Clear button calls', () => {
  it('forgets the last committed letter', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])

    smoother.reset()

    expect(smoother.getDebugState()).toEqual({
      label: null,
      confidence: 0,
      streak: 0,
      lastCommitted: null,
      repeatReady: false,
    })
    expect(run(smoother, frames('L', COMMIT_STREAK))).toEqual(['L'])
  })

  it('clears the streak so a half counted letter does not survive', () => {
    const smoother = createSignSmoother()
    expect(run(smoother, frames('L', COMMIT_STREAK - 1))).toEqual([])

    smoother.reset()

    expect(run(smoother, frames('L', COMMIT_STREAK - 1))).toEqual([])
    expect(run(smoother, frames('L', 1, { start: 400 }))).toEqual(['L'])
  })
})

describe('the developer overlay state', () => {
  it('reports the top prediction, its confidence and the streak', () => {
    const smoother = createSignSmoother()

    smoother.push({ label: 'A', confidence: 0.91, time: 0 })
    expect(smoother.getDebugState()).toEqual({
      label: 'A',
      confidence: 0.91,
      streak: 1,
      lastCommitted: null,
      repeatReady: false,
    })

    smoother.push({ label: 'A', confidence: 0.97, time: 33 })
    expect(smoother.getDebugState()).toMatchObject({ label: 'A', confidence: 0.97, streak: 2 })

    smoother.push({ label: null, confidence: 0, time: 66 })
    expect(smoother.getDebugState()).toMatchObject({ label: null, confidence: 0, streak: 0 })
  })

  it('counts the streak of the class being held, not the last commit', () => {
    const smoother = createSignSmoother()
    run(smoother, frames('L', COMMIT_STREAK))
    run(smoother, frames('E', 3, { start: 300 }))
    expect(smoother.getDebugState()).toMatchObject({
      label: 'E',
      streak: 3,
      lastCommitted: 'L',
    })
  })
})
