import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeApiError, SESSION_ENDED_MESSAGE } from '../services/errorMessages'
import {
  SETUP_MESSAGE,
  apiFetch,
  clearTokens,
  getRefreshToken,
  hasStoredSession,
  isApiConfigured,
  refreshNow,
  registerExpiredHandler,
  storeTokens,
} from '../services/apiClient'
import { AuthContext } from './auth-context'

const MINIMUM_PASSWORD_LENGTH = 8

const SERVER_UNREACHABLE_NOTICE =
  'Signtext could not reach its server. If it is running, check your connection, then refresh this page.'

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoadingSession, setIsLoadingSession] = useState(isApiConfigured && hasStoredSession())
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const unregister = registerExpiredHandler(() => {
      setUser(null)
      setError(SESSION_ENDED_MESSAGE)
    })

    let active = true

    async function restore() {
      if (!hasStoredSession()) {
        if (active) setIsLoadingSession(false)
        return
      }

      try {
        const data = await refreshNow()
        if (active && data?.user) setUser(data.user)
      } catch (restoreError) {
        if (active) {
          setUser(null)
          if (restoreError?.status === 0) {
            setNotice(SERVER_UNREACHABLE_NOTICE)
          }
        }
      } finally {
        if (active) setIsLoadingSession(false)
      }
    }

    restore()

    return () => {
      active = false
      unregister()
    }
  }, [])

  const signUp = useCallback(async ({ email, password, displayName }) => {
    setError('')
    setNotice('')

    if (!isApiConfigured()) {
      setError(SETUP_MESSAGE)
      return { ok: false }
    }

    if (!validateEmail(email)) {
      setError('Enter an email address so we know where to send your account.')
      return { ok: false }
    }

    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(`Choose a password with at least ${MINIMUM_PASSWORD_LENGTH} characters.`)
      return { ok: false }
    }

    setIsWorking(true)

    try {
      const data = await apiFetch('/api/auth/signup', {
        method: 'POST',
        auth: false,
        body: {
          email: email.trim(),
          password,
          display_name: displayName.trim(),
        },
      })
      storeTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
      setUser(data.user)
      return { ok: true }
    } catch (signUpError) {
      setError(describeApiError(signUpError))
      return { ok: false }
    } finally {
      setIsWorking(false)
    }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    setError('')
    setNotice('')

    if (!isApiConfigured()) {
      setError(SETUP_MESSAGE)
      return { ok: false }
    }

    if (!email.trim() || !password) {
      setError('Enter both your email address and your password.')
      return { ok: false }
    }

    setIsWorking(true)

    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: email.trim(), password },
      })
      storeTokens({ accessToken: data.access_token, refreshToken: data.refresh_token })
      setUser(data.user)
      return { ok: true }
    } catch (signInError) {
      setError(describeApiError(signInError))
      return { ok: false }
    } finally {
      setIsWorking(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError('')
    if (!isApiConfigured()) return { ok: true }

    const refreshToken = getRefreshToken()
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        auth: false,
        body: refreshToken ? { refresh_token: refreshToken } : undefined,
      })
    } catch {
      // Signing out still completes if the server cannot be reached.
    } finally {
      clearTokens()
      setUser(null)
    }
    return { ok: true }
  }, [])

  const clearMessages = useCallback(() => {
    setError('')
    setNotice('')
  }, [])

  const value = useMemo(
    () => ({
      session: user,
      user,
      isLoadingSession,
      isWorking,
      error,
      notice,
      isConfigured: isApiConfigured(),
      setupMessage: SETUP_MESSAGE,
      displayName: user?.display_name || user?.email || '',
      signUp,
      signIn,
      signOut,
      clearMessages,
    }),
    [user, isLoadingSession, isWorking, error, notice, signUp, signIn, signOut, clearMessages]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider