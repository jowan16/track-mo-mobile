
import { Redirect } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useAuth } from '@/context/AuthContext'

export default function IndexScreen() {
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

  if (profile.role === 'admin') {
    return <Redirect href="/(admin)" />
  }

  return <Redirect href="/(user)" />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
