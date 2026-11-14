import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

type Destination =
  | '/(auth)/login'
  | '/(admin)'
  | '/(user)'
  | '/(user)/category-dashboard'

export default function IndexScreen() {
  const { session, profile, loading } = useAuth()
  const [destination, setDestination] = useState<Destination | null>(null)
  const [checkingCategories, setCheckingCategories] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (loading) return

    let mounted = true
    setDestination(null)
    setError('')

    if (!session || !profile) {
      setCheckingCategories(false)
      setDestination('/(auth)/login')
      return () => {
        mounted = false
      }
    }

    if (profile.role === 'admin') {
      setCheckingCategories(false)
      setDestination('/(admin)')
      return () => {
        mounted = false
      }
    }

    const checkSelectedCategories = async () => {
      setCheckingCategories(true)

      try {
        const { data, error: queryError } = await supabase
          .from('user_categories')
          .select('category_id')
          .eq('user_id', profile.id)
          .limit(1)

        if (queryError) throw queryError
        if (!mounted) return

        setDestination(
          data && data.length > 0
            ? '/(user)'
            : '/(user)/category-dashboard',
        )
      } catch (queryError) {
        console.error('Unable to check selected categories:', queryError)
        if (mounted) {
          setError(
            queryError instanceof Error
              ? queryError.message
              : 'Unable to check your selected categories.',
          )
        }
      } finally {
        if (mounted) setCheckingCategories(false)
      }
    }

    void checkSelectedCategories()

    return () => {
      mounted = false
    }
  }, [loading, session, profile, retry])

  if (loading || checkingCategories) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    )
  }

  if (destination) {
    return <Redirect href={destination} />
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Unable to load your account</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => setRetry((value) => value + 1)}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0F766E" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: { color: '#14201C', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { color: '#64716B', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  retryButton: {
    marginTop: 18,
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
})
