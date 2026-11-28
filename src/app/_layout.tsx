
import { useEffect, useRef, useState } from 'react'
import { DarkTheme, DefaultTheme, ThemeProvider as RouterThemeProvider, Stack, router } from 'expo-router'
import * as Linking from 'expo-linking'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

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

        const isPasswordRecovery =
          params.get('type') === 'recovery' ||
          parsedUrl.hostname === 'reset-password' ||
          parsedUrl.pathname.replace(/^\/+|\/+$/g, '') === 'reset-password'

        if (callbackError) {
          console.error('Auth callback failed:', callbackError)
          if (isPasswordRecovery) {
            router.replace('/(auth)/reset-password' as never)
          } else {
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
          }
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
            type: otpType as 'signup' | 'email' | 'recovery',
          })
          if (error) throw error
        } else {
          console.warn('Track Mo received an auth deep link without a supported verification token.')
          router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType: 'missing' } } as never)
          return
        }

        // Password recovery must keep the temporary authenticated session so
        // updateUser({ password }) can authorize the password change.
        if (isPasswordRecovery || otpType === 'recovery') {
          router.replace('/(auth)/reset-password?verified=1' as never)
          return
        }

        // Email confirmation is a separate flow from password recovery.
        const { data: verifiedUser, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!verifiedUser.user?.email_confirmed_at) {
          throw new Error('Supabase did not confirm the email verification status.')
        }

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
        const incomingUrlIsRecovery =
          /reset-password/i.test(url) ||
          /type=recovery/i.test(url)
        if (incomingUrlIsRecovery) {
          router.replace('/(auth)/reset-password' as never)
        } else {
          router.replace({ pathname: '/(auth)/verify-email', params: { status: 'error', errorType } } as never)
        }
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

  return (
    <RouterThemeProvider
      value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <>
        <Stack screenOptions={{ headerShown: false, animation: "none" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(user)" />
          <Stack.Screen name="(admin)" />
        </Stack>
        {(!initialUrlChecked || handlingAuthCallback) ? (
          <View
            pointerEvents="auto"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: '#0A211C',
            }}
          />
        ) : null}
      </>
    </RouterThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
