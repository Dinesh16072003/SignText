/**
 * Turns API errors into sentences a person can act on.
 * Raw messages from the API are never shown to the user.
 */

const MESSAGE_BY_DETAIL = {
  invalid_credentials:
    'That email address and password do not match an account. Check them and try again.',
  user_already_exists:
    'An account already uses that email address. Sign in instead, or reset your password.',
  weak_password: 'Choose a longer password. It needs at least 8 characters.',
  validation_failed: 'Check the email address and try again.',
  over_request_rate_limit: 'Too many attempts just now. Wait a minute, then try again.',
  not_found: 'That item could not be found. It may have been deleted already.',
}

export const SESSION_ENDED_MESSAGE =
  'Your session has ended. Sign in again to continue.'

const SERVER_UNREACHABLE_MESSAGE =
  'Signtext could not reach its server. Make sure it is running, then check your connection and try again.'

const GENERIC_API_MESSAGE = 'Something went wrong while talking to the server. Try again.'

export function describeApiError(error) {
  if (error?.status === 0) return SERVER_UNREACHABLE_MESSAGE

  if (error?.status === 401 && error?.detail === 'session_expired') {
    return SESSION_ENDED_MESSAGE
  }

  if (typeof error?.detail === 'string' && MESSAGE_BY_DETAIL[error.detail]) {
    return MESSAGE_BY_DETAIL[error.detail]
  }

  return GENERIC_API_MESSAGE
}