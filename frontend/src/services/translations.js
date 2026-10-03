import { describeDataError } from './errorMessages'
import { isSupabaseConfigured, SETUP_MESSAGE, supabase } from './supabase'

const TABLE = 'translations'
const PAGE_SIZE = 50

/**
 * Saves one translation for the signed-in person.
 * Returns { ok: true, translation } or { ok: false, message }.
 */
export async function saveTranslation({ text, source }) {
  if (!isSupabaseConfigured) {
    return { ok: false, message: SETUP_MESSAGE }
  }

  const trimmed = text.trim()

  if (!trimmed) {
    return { ok: false, message: 'There is no text to save yet.' }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return { ok: false, message: 'Sign in again to save this translation.' }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userData.user.id, text: trimmed, source })
    .select('id, text, source, created_at')
    .single()

  if (error) {
    return { ok: false, message: describeDataError(error) }
  }

  return { ok: true, translation: data }
}

/**
 * Lists the signed-in person's translations, newest first.
 */
export async function listTranslations() {
  if (!isSupabaseConfigured) {
    return { ok: false, message: SETUP_MESSAGE, translations: [] }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, text, source, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (error) {
    return { ok: false, message: describeDataError(error), translations: [] }
  }

  return { ok: true, translations: data ?? [] }
}

/**
 * Deletes one translation belonging to the signed-in person.
 */
export async function deleteTranslation(id) {
  if (!isSupabaseConfigured) {
    return { ok: false, message: SETUP_MESSAGE }
  }

  const { error } = await supabase.from(TABLE).delete().eq('id', id)

  if (error) {
    return { ok: false, message: describeDataError(error) }
  }

  return { ok: true }
}