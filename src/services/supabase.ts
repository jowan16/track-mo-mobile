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
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
