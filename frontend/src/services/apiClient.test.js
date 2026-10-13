import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiFetch,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasStoredSession,
  refreshNow,
  registerExpiredHandler,
  storeTokens,
} from './apiClient'

const REFRESH_PATH = '/api/auth/refresh'
const PROTECTED_PATH = '/api/translations'

const FIRST_ACCESS = 'access-1'
const FIRST_REFRESH = 'refresh-1'
const NEXT_ACCESS = 'access-2'
const NEXT_REFRESH = 'refresh-2'

function okJson(data) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(data ?? null)
    },
  }
}

function errJson(status, detail) {
  return {
    ok: false,
    status,
    async text() {
      return JSON.stringify({ detail })
    },
  }
}

function installServer(responseFor) {
  const calls = []
  const mock = vi.fn((url, init) => {
    calls.push({
      url: String(url),
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : undefined,
    })
    return Promise.resolve(responseFor(String(url), calls.at(-1)))
  })
  vi.stubGlobal('fetch', mock)
  return { calls, mock }
}

beforeEach(() => {
  clearTokens()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('attaches the access token and returns the parsed body', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    const { calls } = installServer(() => okJson({ translations: [] }))

    const data = await apiFetch(PROTECTED_PATH)

    expect(data).toEqual({ translations: [] })
    expect(calls[0].headers.Authorization).toBe(`Bearer ${FIRST_ACCESS}`)
  })

  it('sends a JSON body with the content type header', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    const { calls } = installServer(() => okJson({ id: '1' }))

    await apiFetch(PROTECTED_PATH, { method: 'POST', body: { text: 'hello' } })

    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].body).toEqual({ text: 'hello' })
  })

  it('maps a network failure to an ApiError with status 0', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    const mock = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    vi.stubGlobal('fetch', mock)

    const error = await apiFetch(PROTECTED_PATH).then(
      () => null,
      (e) => e
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })

  it('does not attach a token or refresh for requests with auth disabled', async () => {
    const { calls } = installServer(() => errJson(401, 'invalid_credentials'))

    const error = await apiFetch('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: 'a@b.com', password: 'wrong' },
    }).then(
      () => null,
      (e) => e
    )

    expect(error.status).toBe(401)
    expect(error.detail).toBe('invalid_credentials')
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.Authorization).toBeUndefined()
  })
})

describe('refresh and retry', () => {
  it('refreshes once on an expired session and retries with the new token', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    let protectedCalls = 0
    let refreshCalls = 0
    const { calls } = installServer((url) => {
      if (url.includes(REFRESH_PATH)) {
        refreshCalls += 1
        return okJson({
          access_token: NEXT_ACCESS,
          refresh_token: NEXT_REFRESH,
          user: { id: 'u1', email: 'a@b.com' },
        })
      }
      protectedCalls += 1
      if (protectedCalls === 1) return errJson(401, 'session_expired')
      return okJson({ translations: [] })
    })

    const data = await apiFetch(PROTECTED_PATH)

    expect(protectedCalls).toBe(2)
    expect(refreshCalls).toBe(1)
    expect(calls.filter((c) => c.url.includes(REFRESH_PATH))[0].body).toEqual({
      refresh_token: FIRST_REFRESH,
    })
    expect(calls.filter((c) => c.url.includes(PROTECTED_PATH))[1].headers.Authorization).toBe(
      `Bearer ${NEXT_ACCESS}`
    )
    expect(data).toEqual({ translations: [] })
    expect(getAccessToken()).toBe(NEXT_ACCESS)
    expect(getRefreshToken()).toBe(NEXT_REFRESH)
  })

  it('does not refresh twice when the retried request still returns 401', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    let refreshCalls = 0
    const server = installServer((url) => {
      if (url.includes(REFRESH_PATH)) {
        refreshCalls += 1
        return okJson({ access_token: NEXT_ACCESS, refresh_token: NEXT_REFRESH })
      }
      return errJson(401, 'session_expired')
    })

    const error = await apiFetch(PROTECTED_PATH).then(
      () => null,
      (e) => e
    )

    expect(error.status).toBe(401)
    expect(refreshCalls).toBe(1)
    expect(server.calls.filter((c) => c.url.includes(PROTECTED_PATH))).toHaveLength(2)
  })

  it('performs a single shared refresh when two requests expire at the same time', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    let refreshCalls = 0
    let protectedCalls = 0
    let releaseRefresh
    installServer((url) => {
      if (url.includes(REFRESH_PATH)) {
        refreshCalls += 1
        return new Promise((resolve) => {
          releaseRefresh = () =>
            resolve(
              okJson({
                access_token: NEXT_ACCESS,
                refresh_token: NEXT_REFRESH,
                user: { id: 'u1', email: 'a@b.com' },
              })
            )
        })
      }
      protectedCalls += 1
      return protectedCalls <= 2 ? errJson(401, 'session_expired') : okJson({ ok: true })
    })

    const first = apiFetch(PROTECTED_PATH)
    const second = apiFetch(PROTECTED_PATH)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refreshCalls).toBe(1)

    releaseRefresh()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(refreshCalls).toBe(1)
    expect(protectedCalls).toBe(4)
    expect(firstResult).toEqual({ ok: true })
    expect(secondResult).toEqual({ ok: true })
    expect(getRefreshToken()).toBe(NEXT_REFRESH)
  })
})

describe('refreshNow', () => {
  it('dedupes concurrent callers into one shared request', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    let refreshCalls = 0
    let releaseRefresh
    installServer((url) => {
      if (!url.includes(REFRESH_PATH)) return okJson(null)
      refreshCalls += 1
      return new Promise((resolve) => {
        releaseRefresh = () =>
          resolve(
            okJson({
              access_token: NEXT_ACCESS,
              refresh_token: NEXT_REFRESH,
              user: { id: 'u1', email: 'a@b.com' },
            })
          )
      })
    })

    const first = refreshNow()
    const second = refreshNow()
    releaseRefresh()

    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(refreshCalls).toBe(1)
    expect(firstResult.access_token).toBe(NEXT_ACCESS)
    expect(secondResult.refresh_token).toBe(NEXT_REFRESH)
  })

  it('signs the user out when the server rejects the refresh token', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    const expired = vi.fn()
    const unregister = registerExpiredHandler(expired)
    installServer(() => errJson(401, 'session_expired'))

    const error = await apiFetch(PROTECTED_PATH).then(
      () => null,
      (e) => e
    )

    expect(error.status).toBe(401)
    expect(error.detail).toBe('session_expired')
    expect(expired).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(hasStoredSession()).toBe(false)
    unregister()
  })

  it('keeps the session when the server cannot be reached during refresh', async () => {
    storeTokens({ accessToken: FIRST_ACCESS, refreshToken: FIRST_REFRESH })
    const expired = vi.fn()
    const unregister = registerExpiredHandler(expired)
    installServer((url) => {
      if (url.includes(REFRESH_PATH)) return Promise.reject(new TypeError('fetch failed'))
      return errJson(401, 'session_expired')
    })

    const error = await apiFetch(PROTECTED_PATH).then(
      () => null,
      (e) => e
    )

    expect(error.status).toBe(0)
    expect(expired).not.toHaveBeenCalled()
    expect(getRefreshToken()).toBe(FIRST_REFRESH)
    expect(hasStoredSession()).toBe(true)
    unregister()
  })
})