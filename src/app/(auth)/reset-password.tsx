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

  const strength = Math.min(
    100,
    (password.length >= 8 ? 40 : password.length * 4) +
      (/[A-Za-z]/.test(password) ? 20 : 0) +
      (/\d/.test(password) ? 20 : 0) +
      (/[^A-Za-z0-9]/.test(password) ? 20 : 0),
  )
  const strengthLabel =
    strength < 40 ? 'weak' : strength < 80 ? 'fair' : 'strong'

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
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      Alert.alert(
        'Invalid password',
        'Password must be at least 8 characters and include a letter and a number.',
      )
      return
    }

    if (!confirmPassword) {
      Alert.alert('Missing confirmation', 'Please confirm your password.')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords do not match.')
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

        <View style={styles.strengthContainer}>
          <View style={styles.strengthTrack}>
            <View
              style={[
                styles.strengthFill,
                {
                  width: `${strength}%`,
                  backgroundColor: strength < 60 ? '#B42318' : '#0F766E',
                },
              ]}
            />
          </View>
          <Text style={styles.strengthText}>Strength: {strengthLabel}</Text>
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
  strengthContainer: {
    marginTop: -10,
    marginBottom: 18,
  },
  strengthTrack: {
    height: 7,
    backgroundColor: '#E2E8F0',
    borderRadius: 99,
    overflow: 'hidden',
  },
  strengthFill: {
    height: 7,
    borderRadius: 99,
  },
  strengthText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
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