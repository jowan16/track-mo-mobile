import 'react-native-url-polyfill/auto'

import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase environment variables. Check your mobile .env file.',
  )
}

// Secure storage for Android and iOS.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

// Browser storage for web. During server rendering, browser storage
// is unavailable, so safely return null or do nothing.
const WebStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (typeof window === 'undefined') return null
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(key, value)
    } catch {
      // Browser storage may be unavailable.
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.removeItem(key)
    } catch {
      // Browser storage may be unavailable.
    }
  },
}

const AuthStorage =
  Platform.OS === 'web'
    ? WebStorageAdapter
    : ExpoSecureStoreAdapter

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: AuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
)

if (Platform.OS !== 'web') {
  // Start immediately when the app is already foregrounded; AppState may not
  // emit an initial "active" event after a cold launch.
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh()
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}


/**
 * Run an authenticated Supabase request with a valid access token.
 * Refreshes shortly before expiry and retries once when PostgREST rejects
 * the request specifically because the JWT has expired.
 */
export async function withValidSession<T extends { error: { code?: string; message?: string } | null }>(
  request: () => Promise<T>,
): Promise<T> {
  const refresh = async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) {
      throw error ?? new Error('Your session has expired. Please sign in again.')
    }
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) {
    throw new Error('Your session has expired. Please sign in again.')
  }

  if (
    data.session.expires_at &&
    data.session.expires_at <= Math.floor(Date.now() / 1000) + 60
  ) {
    await refresh()
  }

  let result = await request()
  const expiredJwt =
    result.error?.code === 'PGRST303' ||
    /jwt expired|token expired/i.test(result.error?.message ?? '')

  if (result.error && expiredJwt) {
    await refresh()
    result = await request()
  }

  return result
}
