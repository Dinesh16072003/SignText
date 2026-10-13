const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')

const REFRESH_STORAGE_KEY = 'signtext_refresh_token'
const SESSION_ENDED_DETAIL = 'session_expired'

const memoryStorage = new Map()

export const SETUP_MESSAGE =
  'Signtext is not connected to its server yet. Add VITE_API_URL to frontend/.env (for example http://localhost:8000), then restart the dev server.'

export function isApiConfigured() {
  return API_BASE !== ''
}

function storageGet(key) {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key)
  } catch {}
  return memoryStorage.get(key) ?? null
}

function storageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
      return
    }
  } catch {}
  if (value === null) memoryStorage.delete(key)
  else memoryStorage.set(key, value)
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

let accessToken = null

export function getAccessToken() {
  return accessToken
}

export function getRefreshToken() {
  return storageGet(REFRESH_STORAGE_KEY)
}

export function hasStoredSession() {
  return Boolean(storageGet(REFRESH_STORAGE_KEY))
}

export function storeTokens({ accessToken: nextAccessToken, refreshToken }) {
  if (nextAccessToken) accessToken = nextAccessToken
  if (refreshToken) storageSet(REFRESH_STORAGE_KEY, refreshToken)
}

export function clearTokens() {
  accessToken = null
  storageSet(REFRESH_STORAGE_KEY, null)
}

let expiredHandler = null

export function registerExpiredHandler(handler) {
  expiredHandler = handler
  return () => {
    if (expiredHandler === handler) expiredHandler = null
  }
}

function notifyExpired() {
  clearTokens()
  if (expiredHandler) expiredHandler()
}

async function readResponseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, { method = 'GET', body, auth = true, retry }) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_unreachable')
  }

  const data = await readResponseBody(response)
  const detail = data?.detail ?? data ?? ''

  if (!response.ok) {
    if (
      response.status === 401 &&
      detail === SESSION_ENDED_DETAIL &&
      auth &&
      accessToken &&
      retry
    ) {
      await refreshNow()
      return request(path, { method, body, auth, retry: false })
    }
    throw new ApiError(response.status, detail)
  }

  return data
}

export function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  return request(path, { method, body, auth, retry: true })
}

async function requestRefresh() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    notifyExpired()
    throw new ApiError(401, SESSION_ENDED_DETAIL)
  }

  try {
    const data = await request('/api/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      auth: false,
      retry: false,
    })
    storeTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) throw error
    notifyExpired()
    throw new ApiError(401, SESSION_ENDED_DETAIL)
  }
}

let refreshPromise = null

export function refreshNow() {
  if (!refreshPromise) {
    refreshPromise = requestRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}