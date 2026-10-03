import { useCallback, useEffect, useMemo, useState } from 'react'
import { describeAuthError } from '../services/errorMessages'
import { isSupabaseConfigured, SETUP_MESSAGE, supabase } from '../services/supabase'
import { AuthContext } from './auth-context'

const MINIMUM_PASSWORD_LENGTH = 8

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoadingSession, setIsLoadingSession] = useState(isSupabaseConfigured)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setIsLoadingSession(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoadingSession(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async ({ email, password, displayName }) => {
    setError('')
    setNotice('')

    if (!isSupabaseConfigured) {
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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    })

    setIsWorking(false)

    if (signUpError) {
      setError(describeAuthError(signUpError))
      return { ok: false }
    }

    if (!data.session) {
      setNotice('Check your inbox for a confirmation email, then sign in.')
      return { ok: true, needsConfirmation: true }
    }

    return { ok: true }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    setError('')
    setNotice('')

    if (!isSupabaseConfigured) {
      setError(SETUP_MESSAGE)
      return { ok: false }
    }

    if (!email.trim() || !password) {
      setError('Enter both your email address and your password.')
      return { ok: false }
    }

    setIsWorking(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setIsWorking(false)

    if (signInError) {
      setError(describeAuthError(signInError))
      return { ok: false }
    }

    return { ok: true }
  }, [])

  const signOut = useCallback(async () => {
    setError('')
    if (!isSupabaseConfigured) return { ok: false }

    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      setError(describeAuthError(signOutError))
      return { ok: false }
    }

    return { ok: true }
  }, [])

  const clearMessages = useCallback(() => {
    setError('')
    setNotice('')
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoadingSession,
      isWorking,
      error,
      notice,
      isConfigured: isSupabaseConfigured,
      setupMessage: SETUP_MESSAGE,
      displayName:
        session?.user?.user_metadata?.display_name || session?.user?.email || '',
      signUp,
      signIn,
      signOut,
      clearMessages,
    }),
    [session, isLoadingSession, isWorking, error, notice, signUp, signIn, signOut, clearMessages]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider