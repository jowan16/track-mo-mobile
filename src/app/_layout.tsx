
import * as Linking from 'expo-linking'
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as RouterThemeProvider,
  Stack,
  router,
} from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext'
import { supabase } from '@/services/supabase'

function AppContent() {
  const { resolvedTheme } = useAppTheme()
  const handledAuthUrls = useRef(new Set<string>())
  const verifiedTokenHashes = useRef(new Set<string>())
  const processingAuthCallback = useRef(false)
  const [initialUrlChecked, setInitialUrlChecked] = useState(false)
  const [handlingAuthCallback, setHandlingAuthCallback] = useState(false)

  useEffect(() => {
    const handleAuthCallback = async (url: string) => {
    if (
  !url.toLowerCase().startsWith('trackmomobile://') ||
  handledAuthUrls.current.has(url) ||
  processingAuthCallback.current
) {
  return
}

handledAuthUrls.current.add(url)
processingAuthCallback.current = true
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
          ]
            .join(' ')
            .toLowerCase()

          const errorType = /expired|otp_expired/.test(errorValue)
            ? 'expired'
            : /already|used|token_not_found|one-time token not found|token not found/.test(
                  errorValue,
                )
              ? 'already-used'
              : /token|invalid|missing/.test(errorValue)
                ? 'invalid'
                : 'verification'

          router.replace({
            pathname: '/(auth)/verify-email',
            params: { status: 'error', errorType },
          } as never)

          return
        }

        const tokenHash = params.get('token_hash')
        const otpType = params.get('type')

        // Verify signup using the token hash from the confirmation email.
       if (!tokenHash || otpType !== 'email') {
  // Ignore incomplete or unrelated deep links.
  // Do not show a false verification failure.
  return
}

if (verifiedTokenHashes.current.has(tokenHash)) {
  return
}
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'email',
        })

        if (error) throw error

        if (!data.user?.email_confirmed_at) {
          throw new Error(
            'Supabase did not confirm the email verification status.',
          )
        }
        verifiedTokenHashes.current.add(tokenHash)

        // Clear the temporary session created during email verification.
        const { error: signOutError } = await supabase.auth.signOut({
          scope: 'local',
        })

        if (signOutError) {
          console.warn(
            'Email was verified, but the temporary session could not be cleared:',
            signOutError,
          )
        }

       // Show the email verification success screen.
router.replace({
  pathname: '/(auth)/verify-email',
  params: { status: 'success' },
} as never)
      } catch (error) {
        console.error('Unable to complete email verification:', error)

        const message =
          error instanceof Error ? error.message.toLowerCase() : ''

        const errorType = /expired/.test(message)
          ? 'expired'
          : /already|used|token_not_found|one-time token not found/.test(
                message,
              )
            ? 'already-used'
            : /token|invalid|missing/.test(message)
              ? 'invalid'
              : 'verification'

        router.replace({
          pathname: '/(auth)/verify-email',
          params: { status: 'error', errorType },
        } as never)
      }  finally {
  processingAuthCallback.current = false
  setHandlingAuthCallback(false)
}}

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
        <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
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
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  )
}
