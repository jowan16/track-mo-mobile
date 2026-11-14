
import { useEffect, useRef, useState } from 'react'
import { DarkTheme, DefaultTheme, ThemeProvider as RouterThemeProvider, Stack, router } from 'expo-router'
import * as Linking from 'expo-linking'
import { View } from 'react-native'

import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext'
import { supabase } from '@/services/supabase'


function AppContent() {
  const { resolvedTheme } = useAppTheme()
  const handledAuthUrls = useRef(new Set<string>())
  const [initialUrlChecked, setInitialUrlChecked] = useState(false)
  const [handlingAuthCallback, setHandlingAuthCallback] = useState(false)

  useEffect(() => {
    const handleAuthCallback = async (url: string) => {
      if (!url.toLowerCase().startsWith('trackmomobile://') || handledAuthUrls.current.has(url)) return
      handledAuthUrls.current.add(url)
      setHandlingAuthCallback(true)

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
            : /already|used|token_not_found|one-time token not found|token not found/.test(errorValue)
              ? 'already-used'
              : /token|invalid|missing/.test(errorValue)
                ? 'invalid'
                : 'verification'
          router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType } } as never)
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
          router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType: 'missing' } } as never)
          return
        }

        // Ask Supabase Auth to confirm the account's persisted verification status.
        const { data: verifiedUser, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!verifiedUser.user?.email_confirmed_at) {
          throw new Error('Supabase did not confirm the email verification status.')
        }

        // The verification is complete. Clear the temporary callback session.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) {
          console.warn('Email was verified, but the temporary session could not be cleared:', signOutError)
        }

        router.replace('/(auth)/verify-email?status=success' as never)
      } catch (error) {
        console.error('Unable to complete email verification:', error)
        const message = error instanceof Error ? error.message.toLowerCase() : ''
        const errorType = /expired/.test(message)
          ? 'expired'
          : /already|used|token_not_found|one-time token not found/.test(message)
            ? 'already-used'
            : /token|invalid|missing/.test(message)
              ? 'invalid'
              : 'verification'
        router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType } } as never)
      } finally {
        setHandlingAuthCallback(false)
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthCallback(url)
    })

    void Linking.getInitialURL()
      .then(async (url) => {
        if (url) await handleAuthCallback(url)
      })
      .catch((error) => {
        console.error('Unable to read the app launch URL:', error)
      })
      .finally(() => {
        setInitialUrlChecked(true)
      })

    return () => subscription.remove()
  }, [])

  // Avoid rendering the index/login route while an incoming verification link is being resolved.
  if (!initialUrlChecked || handlingAuthCallback) {
    return <View style={{ flex: 1, backgroundColor: '#0A211C' }} />
  }

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
