import { cp, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const wasmSource = join(here, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const publicDir = join(here, '..', 'public', 'mediapipe')
const wasmTarget = join(publicDir, 'wasm')
const modelTarget = join(publicDir, 'hand_landmarker.task')

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

async function exists(path) {
  try {
    const info = await stat(path)
    return info.size > 0
  } catch {
    return false
  }
}

await mkdir(wasmTarget, { recursive: true })
await cp(wasmSource, wasmTarget, { recursive: true })
console.log('MediaPipe runtime copied to public/mediapipe/wasm')

if (await exists(modelTarget)) {
  console.log('Hand landmark model already present')
} else {
  console.log('Downloading hand landmark model, about 8 MB')
  const response = await fetch(MODEL_URL)

  if (!response.ok) {
    throw new Error(`Could not download the hand landmark model (HTTP ${response.status})`)
  }

  const { writeFile } = await import('node:fs/promises')
  await writeFile(modelTarget, Buffer.from(await response.arrayBuffer()))
  console.log('Hand landmark model saved to public/mediapipe/hand_landmarker.task')
}