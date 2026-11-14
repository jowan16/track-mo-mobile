
import { useEffect, useRef } from 'react'
import { DarkTheme, DefaultTheme, ThemeProvider as RouterThemeProvider, Stack, router } from 'expo-router'
import * as Linking from 'expo-linking'

import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext'
import { supabase } from '@/services/supabase'


function AppContent() {
  const { resolvedTheme } = useAppTheme()
  const handledAuthUrls = useRef(new Set<string>())

  useEffect(() => {
    const handleAuthCallback = async (url: string) => {
      if (!url.toLowerCase().startsWith('trackmomobile://') || handledAuthUrls.current.has(url)) return
      handledAuthUrls.current.add(url)

      try {
        const parsedUrl = new URL(url)
        const params = new URLSearchParams(parsedUrl.search)
        // Some email providers preserve callback parameters in the URL fragment.
        const fragment = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''))
        fragment.forEach((value, key) => {
          if (!params.has(key)) params.set(key, value)
        })

        const callbackError =
          params.get('error_description') ??
          params.get('error') ??
          params.get('error_code')

        if (callbackError) {
          console.error('Email verification callback failed:', callbackError)
          const errorValue = [
            params.get('error_code') ?? '',
            params.get('error') ?? '',
            params.get('error_description') ?? '',
          ].join(' ').toLowerCase()
          const errorType = /expired|otp_expired/.test(errorValue)
            ? 'expired'
            : /already|used|token_not_found/.test(errorValue)
              ? 'already-used'
              : /token|invalid|missing|not found/.test(errorValue)
                ? 'invalid'
                : 'verification'
          router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType } })
          return
        }

        const code = params.get('code')
        const tokenHash = params.get('token_hash')
        const otpType = params.get('type')

        if (code) {
          // Standard Supabase PKCE confirmation callback.
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else if (tokenHash && otpType) {
          // Also support confirmation templates that use TokenHash links.
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as 'signup' | 'email',
          })
          if (error) throw error
        } else {
          console.warn('Track Mo received an auth deep link without a supported verification token.')
          router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType: 'verification' } })
          return
        }

        // Verification is complete; do not keep the temporary callback session.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) throw signOutError

        router.replace('/(auth)/verify-email?status=success')
      } catch (error) {
        console.error('Unable to complete email verification:', error)
        router.replace('/(auth)/login?verification=error')
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthCallback(url)
    })

    void Linking.getInitialURL()
      .then((url) => {
        if (url) void handleAuthCallback(url)
      })
      .catch((error) => {
        console.error('Unable to read the app launch URL:', error)
      })

    return () => subscription.remove()
  }, [])

  return (
    <RouterThemeProvider
      value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <Stack screenOptions={{ headerShown: false, animation: "none" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(user)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </RouterThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  )
}
