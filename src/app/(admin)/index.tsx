
import { router } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/context/AuthContext'

export default function AdminDashboard() {
  const { signOut, profile } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your admin account?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSigningOut(true)
              await signOut()
              router.replace('/(auth)/login')
            } catch (error) {
              setIsSigningOut(false)
              Alert.alert(
                'Sign Out Failed',
                error instanceof Error
                  ? error.message
                  : 'Unable to sign out. Please try again.',
              )
            }
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Track Mo, Pake Ko!</Text>
          <Text style={styles.headerSubtitle}>Administration</Text>
        </View>

        <Pressable
          style={[
            styles.signOutButton,
            isSigningOut && styles.disabledButton,
          ]}
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          <Text style={styles.signOutText}>
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.welcome}>Admin Dashboard</Text>
        <Text style={styles.description}>
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}!
        </Text>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>
            Administrative Dashboard
          </Text>
          <Text style={styles.placeholderDescription}>
            Your administrative features will appear here.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E8E5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F766E',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  signOutButton: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  signOutText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  welcome: {
    fontSize: 25,
    fontWeight: '800',
    color: '#14201C',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
  },
  placeholder: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#E4E8E5',
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#14201C',
  },
  placeholderDescription: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
    lineHeight: 21,
  },
})
