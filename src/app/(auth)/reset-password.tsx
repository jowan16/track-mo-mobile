import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { supabase } from '@/services/supabase'

export default function ResetPasswordScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const hasExchangedCode = useRef(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [verified, setVerified] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const verifyResetLink = async () => {
      if (hasExchangedCode.current) return
      hasExchangedCode.current = true

      if (!code) {
        setVerifying(false)
        setVerified(false)
        return
      }

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) throw error

        setVerified(true)
      } catch {
        setVerified(false)
      } finally {
        setVerifying(false)
      }
    }

    void verifyResetLink()
  }, [code])

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      Alert.alert(
        'Invalid password',
        'Your new password must contain at least 8 characters.',
      )
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Your passwords do not match.')
      return
    }

    try {
      setSaving(true)

      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) throw error

      await supabase.auth.signOut()

      Alert.alert(
        'Password updated',
        'Your password has been changed. Please sign in using your new password.',
        [
          {
            text: 'Continue',
            onPress: () => router.replace('/(auth)/login'),
          },
        ],
      )
    } catch (error) {
      Alert.alert(
        'Update failed',
        error instanceof Error
          ? error.message
          : 'Unable to update your password. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (verifying) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Verifying reset link...</Text>
      </View>
    )
  }

  if (!verified) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Invalid or expired link</Text>
          <Text style={styles.description}>
            This password reset link is invalid or has expired. Request a new
            password reset email to continue.
          </Text>

          <Pressable
            style={styles.button}
            onPress={() => router.replace('/(auth)/forgot-password')}
          >
            <Text style={styles.buttonText}>Request a New Link</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>Track Mo, Pake Ko!</Text>
        <Text style={styles.title}>Create a New Password</Text>
        <Text style={styles.description}>
          Enter your new password below.
        </Text>

        <Text style={styles.label}>New password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="At least 8 characters"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            editable={!saving}
          />

          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            disabled={saving}
          >
            <Text style={styles.showPassword}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          style={styles.input}
          placeholder="Re-enter your new password"
          placeholderTextColor="#9CA3AF"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!saving}
        />

        <Pressable
          style={[styles.button, saving && styles.disabledButton]}
          onPress={handleUpdatePassword}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Update Password</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    marginTop: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logo: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2563EB',
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 21,
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
  passwordContainer: {
    height: 50,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
  },
  showPassword: {
    color: '#2563EB',
    fontWeight: '600',
    paddingLeft: 10,
  },
  button: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
})