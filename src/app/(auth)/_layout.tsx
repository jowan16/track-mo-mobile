import { Redirect, Stack, usePathname } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useAuth } from '@/context/AuthContext'

export default function AuthLayout() {
  const { session, profile, loading } = useAuth()
  const pathname = usePathname()

  const isResetPassword = pathname.endsWith('/reset-password')

  // Allow the password reset screen to open even if
  // Supabase has already established a recovery session.
  if (isResetPassword) {
    return <Stack screenOptions={{ headerShown: false }} />
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

  return <Stack screenOptions={{ headerShown: false }} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
})