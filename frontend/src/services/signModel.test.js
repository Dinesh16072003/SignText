/**
 * Runs the real TensorFlow.js graph model in frontend/public/models/sign-model
 * on saved feature vectors from the Step 5 test set and checks that it names
 * the same classes as the Python SavedModel did in Part 6E.
 *
 * The fixture is written by ml/export_sign_fixture.py. The files are read from
 * disk because a test has no web server to fetch them from.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tf from '@tensorflow/tfjs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import fixture from '../data/signFixture.json'
import {
  EXPECTED_CLASS_COUNT,
  SIGN_MODEL_MESSAGES,
  loadSignModel,
  predictSign,
} from './signModel'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODEL_DIR = join(PROJECT_ROOT, 'public', 'models', 'sign-model')
const MODEL_JSON_PATH = join(MODEL_DIR, 'model.json')
const CLASS_NAMES_PATH = join(MODEL_DIR, 'class_names.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// The browser gets the model over HTTP from a graph model URL. Here the same
// bytes are handed to TensorFlow.js through a small IOHandler instead.
function loadGraphModelFromDisk() {
  const manifest = readJson(MODEL_JSON_PATH)
  const weightSpecs = []
  const chunks = []

  for (const group of manifest.weightsManifest) {
    for (const path of group.paths) chunks.push(readFileSync(join(MODEL_DIR, path)))
    for (const weight of group.weights) weightSpecs.push(weight)
  }

  const merged = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return tf.loadGraphModel({
    load: async () => ({
      modelTopology: manifest.modelTopology,
      format: manifest.format,
      generatedBy: manifest.generatedBy,
      convertedBy: manifest.convertedBy,
      weightSpecs,
      weightData: merged.buffer,
    }),
  })
}

let loaded = null

beforeAll(async () => {
  loaded = await loadSignModel({
    modelUrl: MODEL_JSON_PATH,
    classNamesUrl: CLASS_NAMES_PATH,
    fetchJson: readJson,
    loadGraphModel: loadGraphModelFromDisk,
  })
})

describe('the exported model', () => {
  it('is a graph model, which is the loader this app uses', () => {
    expect(readJson(MODEL_JSON_PATH).format).toBe('graph-model')
  })

  it('has 28 class names in the training order', () => {
    expect(loaded.classNames).toHaveLength(EXPECTED_CLASS_COUNT)
    expect(loaded.classCount).toBe(EXPECTED_CLASS_COUNT)
    expect(loaded.classNames).toEqual(fixture.classNames)
    expect(loaded.classNames[0]).toBe('A')
    expect(loaded.classNames.at(-2)).toBe('space')
    expect(loaded.classNames.at(-1)).toBe('del')
  })

  it('reads 126 numbers and writes 28 probabilities', () => {
    const prediction = predictSign(loaded, fixture.samples[0].features)
    expect(prediction.label).toBeTypeOf('string')
    expect(prediction.confidence).toBeGreaterThan(0)
    expect(prediction.confidence).toBeLessThanOrEqual(1)
  })

  it('refuses features of the wrong length instead of guessing', () => {
    expect(predictSign(loaded, [0, 0, 0])).toBeNull()
    expect(predictSign(loaded, null)).toBeNull()
    expect(predictSign(null, fixture.samples[0].features)).toBeNull()
  })
})

describe('agreement with the Python results from Part 6E', () => {
  it('predicts the same class as the SavedModel for every saved sample', () => {
    const mismatches = fixture.samples
      .map((sample) => ({
        expected: sample.expected,
        actual: predictSign(loaded, sample.features)?.label,
      }))
      .filter(({ expected, actual }) => expected !== actual)

    expect(mismatches).toEqual([])
    expect(fixture.samples.length).toBeGreaterThanOrEqual(8)
  })

  it('lands on the same probabilities, up to rounding', () => {
    for (const sample of fixture.samples) {
      const prediction = predictSign(loaded, sample.features)
      expect(prediction.confidence).toBeCloseTo(sample.confidence, 4)
    }
  })
})

describe('loading, when something is wrong', () => {
  it('refuses a class list that does not hold 28 entries', async () => {
    const classNamesUrl = 'class_names.json'
    await expect(
      loadSignModel({
        modelUrl: MODEL_JSON_PATH,
        classNamesUrl,
        fetchJson: async () => loaded.classNames.slice(0, 27),
        loadGraphModel: loadGraphModelFromDisk,
      })
    ).rejects.toThrow(/lists 27 classes but this model has 28/)
  })

  it('says No sign model loaded when the model files are missing', async () => {
    // The real fetcher, pointed at something that cannot be read.
    await expect(
      loadSignModel({ classNamesUrl: 'file:///signtext/class_names.json' })
    ).rejects.toThrow(SIGN_MODEL_MESSAGES.missing)

    await expect(
      loadSignModel({
        modelUrl: MODEL_JSON_PATH,
        classNamesUrl: CLASS_NAMES_PATH,
        fetchJson: readJson,
        loadGraphModel: async () => {
          throw new Error('Request to /models/sign-model/model.json failed with status code 404')
        },
      })
    ).rejects.toThrow(SIGN_MODEL_MESSAGES.missing)
  })

  it('explains a model that is in the wrong format', async () => {
    await expect(
      loadSignModel({
        modelUrl: MODEL_JSON_PATH,
        classNamesUrl: CLASS_NAMES_PATH,
        fetchJson: readJson,
        loadGraphModel: async () => {
          throw new Error('The JSON of the model topology is not a graph model')
        },
      })
    ).rejects.toThrow(/wrong format/)
  })
})

// A single page app server answers a request for a file it does not have with
// its own HTML page and a status of 200, which is what a real host and the
// development server both do.
function htmlPage() {
  return new Response('<!DOCTYPE html><html><body>Signtext</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function jsonBody(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const NEVER_LOADED = async () => {
  throw new Error('the model should never be reached')
}

describe('when the server answers with its own page', () => {
  it('says No sign model loaded for class_names.json', async () => {
    vi.stubGlobal('fetch', async () => htmlPage())

    try {
      await expect(
        loadSignModel({
          modelUrl: 'https://signtext.test/models/sign-model/model.json',
          classNamesUrl: 'https://signtext.test/models/sign-model/class_names.json',
          loadGraphModel: NEVER_LOADED,
        })
      ).rejects.toThrow(SIGN_MODEL_MESSAGES.missing)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('says No sign model loaded for model.json', async () => {
    vi.stubGlobal('fetch', async (url) =>
      String(url).includes('class_names') ? jsonBody(loaded.classNames) : htmlPage()
    )

    try {
      await expect(
        loadSignModel({
          modelUrl: 'https://signtext.test/models/sign-model/model.json',
          classNamesUrl: 'https://signtext.test/models/sign-model/class_names.json',
          loadGraphModel: NEVER_LOADED,
        })
      ).rejects.toThrow(SIGN_MODEL_MESSAGES.missing)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('when model.json describes another kind of model', () => {
  it('names the model it found instead of pretending', async () => {
    await expect(
      loadSignModel({
        modelUrl: 'model.json',
        classNamesUrl: 'class_names.json',
        fetchJson: async (url) =>
          String(url).includes('class_names') ? loaded.classNames : { format: 'layer-model' },
        loadGraphModel: NEVER_LOADED,
      })
    ).rejects.toThrow(/describes a layer-model model/)
  })
})
