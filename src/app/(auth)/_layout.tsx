import { Redirect, Stack, usePathname } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useAuth } from '@/context/AuthContext'

export default function AuthLayout() {
  const { session, profile, loading } = useAuth()
  const pathname = usePathname()

  const isResetPassword = pathname.endsWith('/reset-password')
  const isLogin = pathname.endsWith('/login')
  const isForgotPassword = pathname.endsWith('/forgot-password')
  const isRegister = pathname.endsWith('/register')

  // Keep public authentication screens accessible regardless of whether a
  // previous Supabase session is still being restored or is already active.
  // Login, registration, forgot-password, and password recovery must not be
  // blocked by the authenticated-user redirect.
  if (isResetPassword || isLogin || isForgotPassword || isRegister) {
    return <Stack screenOptions={{ headerShown: false, animation: "none" }} />
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  if (session && profile) {
    if (profile.role === 'admin') {
      return <Redirect href="/(admin)" />
    }

    return <Redirect href="/(user)" />
  }

  return <Stack screenOptions={{ headerShown: false, animation: "none" }} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
})