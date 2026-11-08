
import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useAuth } from '@/context/AuthContext'

export default function AdminLayout() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  if (!session || !profile) {
    return <Redirect href="/(auth)/login" />
  }

  if (profile.role !== 'admin') {
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
