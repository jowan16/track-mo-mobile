
import { router } from 'expo-router'
import { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'

import { supabase } from '@/services/supabase'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Please enter your registered email address.')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: 'trackmomobile://reset-password',
        },
      )

      if (error) throw error

      Alert.alert(
        'Check your email',
        'If the address is registered, you will receive a password reset link.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      )
    } catch (error) {
      Alert.alert(
        'Request failed',
        error instanceof Error
          ? error.message
          : 'Unable to send the password reset email.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Forgot Password?</Text>

        <Text style={styles.description}>
          Enter the email address associated with your account. We'll send
          instructions to reset your password.
        </Text>

        <Text style={styles.label}>Email address</Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your registered email"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <Pressable
          style={[styles.button, loading && styles.disabledButton]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backButton}
          onPress={() => router.replace('/(auth)/login')}
          disabled={loading}
        >
          <Text style={styles.backText}>Back to Login</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 20,
  },
  button: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  backButton: {
    alignItems: 'center',
    marginTop: 22,
  },
  backText: {
    color: '#2563EB',
    fontWeight: '600',
  },
})
