const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')

const SESSION_ENDED_DETAIL = 'session_expired'

export const SETUP_MESSAGE =
  'Signtext is not connected to its server yet. Add VITE_API_URL to frontend/.env (for example http://localhost:8000), then restart the dev server.'

export function isApiConfigured() {
  return API_BASE !== ''
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

export function storeTokens({ accessToken: nextAccessToken }) {
  if (nextAccessToken) accessToken = nextAccessToken
}

export function clearTokens() {
  accessToken = null
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
      credentials: 'include',
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
  try {
    const data = await request('/api/auth/refresh', {
      method: 'POST',
      auth: false,
      retry: false,
    })
    storeTokens({ accessToken: data.access_token })
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