
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
      if (!url.startsWith('trackmomobile://') || handledAuthUrls.current.has(url)) return
      handledAuthUrls.current.add(url)

      const { queryParams } = Linking.parse(url)
      const callbackError = queryParams?.error_description ?? queryParams?.error

      if (callbackError) {
        console.error('Email verification callback failed:', callbackError)
        router.replace('/(auth)/login?verification=error')
        return
      }

      const code = queryParams?.code
      if (typeof code !== 'string' || !code) return

      try {
        // Complete Supabase's PKCE exchange before returning to the login screen.
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error

        // Email confirmation should not automatically sign the user in.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) throw signOutError

        router.replace('/(auth)/login?verification=success')
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
