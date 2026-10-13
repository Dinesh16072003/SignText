import { describeApiError } from './errorMessages'
import { SETUP_MESSAGE, apiFetch, getAccessToken, isApiConfigured } from './apiClient'

const PAGE_SIZE = 50

/**
 * Saves one translation for the signed-in person.
 * Returns { ok: true, translation } or { ok: false, message }.
 */
export async function saveTranslation({ text, source }) {
  if (!isApiConfigured()) {
    return { ok: false, message: SETUP_MESSAGE }
  }

  const trimmed = text.trim()

  if (!trimmed) {
    return { ok: false, message: 'There is no text to save yet.' }
  }

  if (!getAccessToken()) {
    return { ok: false, message: 'Sign in again to save this translation.' }
  }

  try {
    const translation = await apiFetch('/api/translations', {
      method: 'POST',
      body: { text: trimmed, source },
    })
    return { ok: true, translation }
  } catch (error) {
    return { ok: false, message: describeApiError(error) }
  }
}

/**
 * Lists the signed-in person's translations, newest first.
 */
export async function listTranslations() {
  if (!isApiConfigured()) {
    return { ok: false, message: SETUP_MESSAGE, translations: [] }
  }

  if (!getAccessToken()) {
    return { ok: false, message: 'Sign in again to view your history.', translations: [] }
  }

  try {
    const data = await apiFetch(`/api/translations?page=1&page_size=${PAGE_SIZE}`)
    return { ok: true, translations: data.translations ?? [] }
  } catch (error) {
    return { ok: false, message: describeApiError(error), translations: [] }
  }
}

/**
 * Deletes one translation belonging to the signed-in person.
 */
export async function deleteTranslation(id) {
  if (!isApiConfigured()) {
    return { ok: false, message: SETUP_MESSAGE }
  }

  if (!getAccessToken()) {
    return { ok: false, message: 'Sign in again to delete this translation.' }
  }

  try {
    await apiFetch(`/api/translations/${id}`, { method: 'DELETE' })
    return { ok: true }
  } catch (error) {
    if (error.status === 404) {
      return { ok: false, message: 'That translation is already gone. Refresh the list to see the latest.' }
    }
    return { ok: false, message: describeApiError(error) }
  }
}