/**
 * Loads and runs the trained alphabet model in the browser.
 *
 * The export in frontend/public/models/sign-model/ is a TensorFlow.js GRAPH
 * model (see ml/FEATURE_SPEC.md), so it is loaded with tf.loadGraphModel(),
 * never with the layers loader tf.loadLayersModel(). The graph model carries
 * a TensorFlow GraphDef, not a Keras layer stack, and the layers loader
 * rejects it.
 *
 * This module is pure JavaScript plus TensorFlow.js: no React, no camera and
 * no hand tracking. It never invents a prediction: if the model files are
 * missing or do not agree with each other, loading fails and callers get a
 * plain language message instead of numbers.
 */

import { FEATURE_LENGTH } from './handFeatures'

const BASE = import.meta.env.BASE_URL

// TensorFlow.js is a large library and this page only needs it once a frame
// is ready to be read, so it is imported in the background the first time the
// model is asked for. Until then the first paint of the page is not waiting
// for it.
let tfModule = null

async function getTensorFlow() {
  if (!tfModule) tfModule = await import('@tensorflow/tfjs')
  return tfModule
}

export const SIGN_MODEL_URL = `${BASE}models/sign-model/model.json`
export const SIGN_CLASS_NAMES_URL = `${BASE}models/sign-model/class_names.json`

// The training class count, fixed by ml/FEATURE_SPEC.md.
export const EXPECTED_CLASS_COUNT = 28

export const SIGN_MODEL_MESSAGES = {
  loading: 'Loading sign model...',
  ready: 'Sign model ready',
  missing: 'No sign model loaded',
}

const CANNOT_USE = ' The sign model cannot be used.'

/**
 * Carries a plain language message plus the kind of failure, so the caller
 * can tell "the files are not there" from "the files are wrong".
 */
export class SignModelError extends Error {
  constructor(kind, message) {
    super(message)
    this.name = 'SignModelError'
    this.kind = kind
  }
}

function invalid(message) {
  return new SignModelError('invalid', `${message}${CANNOT_USE}`)
}

function looksLikeMissingFile(message) {
  return /\b404\b|failed to fetch|networkerror|load failed/i.test(message)
}

function missingFile() {
  return new SignModelError('missing', SIGN_MODEL_MESSAGES.missing)
}

function fileName(url) {
  return String(url).split('/').pop()
}

async function fetchJsonUrl(url) {
  let response
  try {
    response = await fetch(url)
  } catch {
    throw missingFile()
  }

  if (!response.ok) {
    throw missingFile()
  }

  const contentType = response.headers.get('content-type') ?? ''

  let body
  try {
    body = await response.text()
  } catch {
    throw missingFile()
  }

  try {
    return JSON.parse(body)
  } catch {
    // A single page app answers a missing file with its own HTML page and a
    // status of 200, so the body is the only reliable witness. The file is
    // only genuinely broken when the server insists it is JSON.
    if (!/json/i.test(contentType)) throw missingFile()
    throw invalid(`${fileName(url)} is not valid JSON.`)
  }
}

async function readClassNames(classNamesUrl, fetchJson) {
  const names = await fetchJson(classNamesUrl)

  if (!Array.isArray(names)) {
    throw invalid('class_names.json does not hold a list of class names.')
  }
  if (names.some((name) => typeof name !== 'string' || name.trim() === '')) {
    throw invalid('class_names.json holds a class name that is not a word.')
  }
  if (names.length !== EXPECTED_CLASS_COUNT) {
    throw invalid(
      `class_names.json lists ${names.length} classes but this model has ${EXPECTED_CLASS_COUNT}.`
    )
  }

  return names
}

/**
 * Reads model.json itself before TensorFlow.js does, for two reasons: a file
 * that is not there is found here instead of surfacing as a confusing parse
 * error, and a model of the wrong kind is named for what it is.
 */
async function readTopology(modelUrl, fetchJson) {
  const topology = await fetchJson(modelUrl)

  if (topology?.format && topology.format !== 'graph-model') {
    throw invalid(
      `model.json describes a ${topology.format} model, and this app needs a TensorFlow.js graph model.`
    )
  }

  return topology
}

async function readGraphModel(modelUrl, fetchJson, loadGraphModel) {
  await readTopology(modelUrl, fetchJson)

  try {
    return await loadGraphModel(modelUrl)
  } catch (error) {
    const reason = String(error?.message ?? error)

    if (looksLikeMissingFile(reason)) {
      throw missingFile()
    }

    console.error('Sign model could not be loaded:', error)
    throw new SignModelError(
      'failed',
      /graph model|topology|layers/i.test(reason)
        ? `The model file is in the wrong format. This app needs a TensorFlow.js graph model.${CANNOT_USE}`
        : `The model files could not be read. Check that models/sign-model is complete, then reload the page.${CANNOT_USE}`
    )
  }
}

/**
 * Runs the model once on a zero row purely to read the output width. This is
 * what proves that class_names.json and the model agree, and it fails at load
 * time instead of producing nonsense on the first frame.
 */
function readOutputWidth(tf, model, classNames) {
  let shape

  try {
    const output = tf.tidy(() => {
      const result = model.execute(tf.zeros([1, FEATURE_LENGTH]))
      return Array.isArray(result) ? result[0] : result
    })
    shape = output.shape
    output.dispose()
  } catch (error) {
    console.error('Sign model rejected a 126 number input:', error)
    throw invalid(
      `The model does not take ${FEATURE_LENGTH} numbers as input, which ml/FEATURE_SPEC.md requires.`
    )
  }

  const width = Array.isArray(shape) ? shape[shape.length - 1] : undefined
  if (typeof width !== 'number' || width !== classNames.length) {
    throw invalid(
      `The model returns ${width ?? 'an unknown number of'} classes but class_names.json lists ${classNames.length}.`
    )
  }

  return width
}

/**
 * Reads class_names.json and model.json with the same fetchJson reader, runs
 * the graph model, and returns { model, classNames, classCount }. Every
 * failure is a SignModelError with a message meant for a person.
 *
 * The file reader and the model loader are injectable so tests can read the
 * same files from disk instead of over HTTP.
 */
export async function loadSignModel({
  modelUrl = SIGN_MODEL_URL,
  classNamesUrl = SIGN_CLASS_NAMES_URL,
  fetchJson = fetchJsonUrl,
  loadGraphModel,
} = {}) {
  const tf = await getTensorFlow()
  const classNames = await readClassNames(classNamesUrl, fetchJson)
  const model = await readGraphModel(modelUrl, fetchJson, loadGraphModel ?? tf.loadGraphModel)
  const classCount = readOutputWidth(tf, model, classNames)

  return { model, classNames, classCount }
}

/**
 * Runs one frame of FEATURE_LENGTH numbers through the model and returns the
 * strongest `count` classes as { index, label, confidence }, strongest first.
 * Returns an empty list when there is nothing to run. Used by the developer
 * overlay to show the top three candidates; predictSign reads the same numbers
 * through this function, so the two never disagree.
 *
 * Every tensor is created and destroyed inside tf.tidy, so nothing is left
 * behind after thousands of frames.
 */
export function predictTopClasses(signModel, features, count = 3) {
  const tf = tfModule

  // Until loadSignModel has finished there is nothing to run, and a missing
  // prediction is what keeps the text pane honest.
  if (!tf || !signModel?.model || !Array.isArray(features) || features.length !== FEATURE_LENGTH) {
    return []
  }

  const { model, classNames } = signModel

  return tf.tidy(() => {
    const input = tf.tensor2d(features, [1, FEATURE_LENGTH])
    const result = model.execute(input)
    const output = Array.isArray(result) ? result[0] : result
    const probabilities = output.dataSync()

    return Array.from(probabilities)
      .map((confidence, index) => ({ index, label: classNames[index], confidence }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, count)
  })
}

/**
 * Runs one frame of FEATURE_LENGTH numbers through the model and returns the
 * single strongest { index, label, confidence }, or null when there is
 * nothing to run.
 */
export function predictSign(signModel, features) {
  return predictTopClasses(signModel, features, 1)[0] ?? null
}
