/**
 * Loads the model exactly as the browser does: over HTTP, with the default
 * fetch reader and the default TensorFlow.js loader, then runs every saved
 * feature vector through it.
 *
 * It needs a running web server, so it is skipped unless one is named:
 *
 *   SIGNTEXT_SMOKE_URL=http://localhost:5174/models/sign-model \
 *     npx vitest run src/services/signModelHttp.test.js
 */

import { describe, expect, it } from 'vitest'
import fixture from '../data/signFixture.json'
import { EXPECTED_CLASS_COUNT, SIGN_MODEL_MESSAGES, loadSignModel, predictSign } from './signModel'

const BASE = process.env.SIGNTEXT_SMOKE_URL ?? ''

describe.runIf(BASE)('the HTTP path the browser uses', () => {
  it('loads the graph model and agrees with every saved sample', async () => {
    const loaded = await loadSignModel({
      modelUrl: `${BASE}/model.json`,
      classNamesUrl: `${BASE}/class_names.json`,
    })

    expect(loaded.classCount).toBe(EXPECTED_CLASS_COUNT)

    const mismatches = fixture.samples.filter(
      (sample) => predictSign(loaded, sample.features)?.label !== sample.expected
    )
    expect(mismatches).toEqual([])
  }, 60000)

  it('says No sign model loaded when the model file is not there', async () => {
    await expect(
      loadSignModel({
        modelUrl: `${BASE}/missing-model.json`,
        classNamesUrl: `${BASE}/class_names.json`,
      })
    ).rejects.toThrow(SIGN_MODEL_MESSAGES.missing)
  }, 30000)
})
