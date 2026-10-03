import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

// Only the public anon key is ever used here. The service role key must stay on
// the server and must never be shipped to the browser.
export const isSupabaseConfigured = supabaseUrl !== '' && supabaseAnonKey !== ''

export const SETUP_MESSAGE =
  'Signtext is not connected to a database yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env, then restart the dev server. Use the anon public key from your Supabase project settings, never the service role key.'

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null