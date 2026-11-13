import { Redirect, Stack, usePathname } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useAuth } from '@/context/AuthContext'

export default function AuthLayout() {
  const { session, profile, loading } = useAuth()
  const pathname = usePathname()

  const isResetPassword = pathname.endsWith('/reset-password')
  const isLogin = pathname.endsWith('/login')

  // Keep the login screen mounted after authentication so the login handler
  // can check saved category selections before choosing the next destination.
  // Also allow password recovery to finish even with a recovery session.
  if (isResetPassword || isLogin) {
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