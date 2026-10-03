/**
 * Turns Supabase and network failures into sentences a person can act on.
 * Raw messages from the API are never shown to the user.
 *
 * Error codes are matched first, because they are stable. Message text is only
 * used as a fallback for older responses.
 */

const AUTH_BY_CODE = {
  email_provider_disabled:
    'Signing in with an email address is switched off for this project. In Supabase, open Authentication, then Providers, then Email, and turn it on.',
  invalid_credentials:
    'That email address and password do not match an account. Check them and try again.',
  user_already_exists:
    'An account already uses that email address. Sign in instead, or reset your password.',
  weak_password: 'Choose a longer password. It needs at least 8 characters.',
  validation_failed: 'Check the email address and try again.',
  over_email_send_rate_limit: 'Too many attempts just now. Wait a minute, then try again.',
  over_request_rate_limit: 'Too many attempts just now. Wait a minute, then try again.',
  email_address_not_authorized: 'That email address cannot be used for an account.',
}

const AUTH_BY_MESSAGE = {
  'Invalid login credentials':
    'That email address and password do not match an account. Check them and try again.',
  'User already registered':
    'An account already uses that email address. Sign in instead, or reset your password.',
  'Email not confirmed':
    'This email address still needs to be confirmed. Check your inbox for the confirmation email.',
  'Password should be at least 8 characters':
    'Choose a password with at least 8 characters.',
  'Email logins are disabled':
    'Signing in with an email address is switched off for this project. In Supabase, open Authentication, then Providers, then Email, and turn it on.',
  'Unable to validate email address': 'That does not look like a valid email address.',
}

const GENERIC_AUTH_MESSAGE =
  'Something went wrong while talking to the database. Check your connection and try again.'

const GENERIC_DATA_MESSAGE =
  'Something went wrong while reaching your saved translations. Check your connection and try again.'

const MISSING_TABLES_MESSAGE =
  'The database tables are missing. Run schema.sql and policies.sql in the Supabase SQL editor, then try again.'

const OFFLINE_MESSAGE =
  'No connection to the database. Check your internet connection and try again.'

function isMissingTable(error) {
  const code = error?.code ?? ''
  return code === '42P01' || code === 'PGRST205'
}

function looksOffline(error) {
  return /fetch|network|failed to fetch/i.test(error?.message ?? '')
}

export function describeAuthError(error) {
  if (!error) return GENERIC_AUTH_MESSAGE

  if (AUTH_BY_CODE[error.code]) return AUTH_BY_CODE[error.code]

  if (typeof error.message === 'string' && AUTH_BY_MESSAGE[error.message]) {
    return AUTH_BY_MESSAGE[error.message]
  }

  if (error.status === 429) {
    return 'Too many attempts just now. Wait a minute, then try again.'
  }

  if (isMissingTable(error)) return MISSING_TABLES_MESSAGE

  if (looksOffline(error)) return OFFLINE_MESSAGE

  return GENERIC_AUTH_MESSAGE
}

export function describeDataError(error) {
  if (!error) return GENERIC_DATA_MESSAGE

  if (error.status === 401 || error.code === 'PGRST301') {
    return 'Your session has ended. Sign in again to continue.'
  }

  if (isMissingTable(error)) return MISSING_TABLES_MESSAGE

  if (error.status === 403 || error.code === '42501') {
    return 'This item belongs to a different account, so it cannot be changed.'
  }

  if (looksOffline(error)) return OFFLINE_MESSAGE

  return GENERIC_DATA_MESSAGE
}