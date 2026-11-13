import { router, useLocalSearchParams } from 'expo-router'
import * as ExpoLinking from 'expo-linking'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')

  const passwordsMatch = password.length > 0 && password === confirmPassword

  useEffect(() => {
    let mounted = true

    const verifyResetLink = async (incomingCode?: string) => {
      if (hasExchangedCode.current || !incomingCode) return

      hasExchangedCode.current = true

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(incomingCode)
        if (error) throw error
        if (mounted) setVerified(true)
      } catch (error) {
        console.warn('Password reset link verification failed:', error)
        if (mounted) setVerified(false)
      } finally {
        if (mounted) setVerifying(false)
      }
    }

    const readIncomingLink = async () => {
      const routeCode = Array.isArray(code) ? code[0] : code
      if (routeCode) {
        await verifyResetLink(routeCode)
        return
      }

      try {
        const initialUrl = await Linking.getInitialURL()
        const parsed = initialUrl ? ExpoLinking.parse(initialUrl) : null
        const queryCode = parsed?.queryParams?.code
        const incomingCode = Array.isArray(queryCode) ? queryCode[0] : queryCode
        if (typeof incomingCode === 'string' && incomingCode) {
          await verifyResetLink(incomingCode)
          return
        }
      } catch (error) {
        console.warn('Unable to read password reset link:', error)
      }

      if (mounted && !hasExchangedCode.current) {
        setVerified(false)
        setVerifying(false)
      }
    }

    void readIncomingLink()

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const parsed = ExpoLinking.parse(url)
      const queryCode = parsed.queryParams?.code
      const incomingCode = Array.isArray(queryCode) ? queryCode[0] : queryCode
      if (typeof incomingCode === 'string' && incomingCode) {
        void verifyResetLink(incomingCode)
      }
    })

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [code])

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    setPasswordError('')

    if (confirmPassword && value !== confirmPassword) {
      setConfirmError('Passwords do not match.')
    } else {
      setConfirmError('')
    }
  }

  const handleConfirmChange = (value: string) => {
    setConfirmPassword(value)
    setConfirmError(
      value.length > 0 && value !== password ? 'Passwords do not match.' : '',
    )
  }

  const handleUpdatePassword = async () => {
    Keyboard.dismiss()
    let hasError = false

    if (!password) {
      setPasswordError('Please enter a new password.')
      hasError = true
    } else {
      setPasswordError('')
    }

    if (!confirmPassword) {
      setConfirmError('Please confirm your new password.')
      hasError = true
    } else if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.')
      hasError = true
    } else {
      setConfirmError('')
    }

    if (hasError || saving) return

    try {
      setSaving(true)

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      await supabase.auth.signOut({ scope: 'local' })
      router.replace('/(auth)/login')

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
        <ActivityIndicator size="large" color="#5EEAD4" />
        <Text style={styles.loadingText}>Verifying reset link...</Text>
      </View>
    )
  }

  if (!verified) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>₱</Text>
            </View>
            <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
            <Text style={styles.brandTagline}>Your money. Your control.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.statusIcon}>
              <Text style={styles.statusIconText}>!</Text>
            </View>
            <Text style={styles.title}>Invalid or expired link</Text>
            <Text style={styles.description}>
              This password reset link is invalid or has expired. Request a
              new password reset email to continue.
            </Text>

            <Pressable
              style={styles.button}
              onPress={() => router.replace('/(auth)/forgot-password')}
            >
              <Text style={styles.buttonText}>Request a New Link</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.secondaryButtonText}>Back to Log in</Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Track your expenses. Manage your budget. Stay in control.
          </Text>
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>₱</Text>
          </View>
          <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
          <Text style={styles.brandTagline}>Your money. Your control.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create a new password</Text>
          <Text style={styles.description}>
            Choose a strong password to keep your account secure.
          </Text>

          <Text style={styles.label}>New password</Text>
          <View style={[styles.passwordContainer, passwordError ? styles.inputInvalid : null]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your new password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              returnKeyType="next"
            />
            <Pressable
              onPress={() => setShowPassword((previous) => !previous)}
              disabled={saving}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.showPassword}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

          <Text style={styles.label}>Confirm new password</Text>
          <View style={[styles.passwordContainer, confirmError ? styles.inputInvalid : null]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Re-enter your new password"
              placeholderTextColor="#94A3B8"
              value={confirmPassword}
              onChangeText={handleConfirmChange}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={handleUpdatePassword}
            />
            <Pressable
              onPress={() => setShowPassword((previous) => !previous)}
              disabled={saving}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.showPassword}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {confirmError ? <Text style={styles.fieldError}>{confirmError}</Text> : null}
          {confirmPassword && passwordsMatch ? (
            <Text style={styles.matchText}>✓ Passwords match</Text>
          ) : null}

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

        <Text style={styles.footer}>Track your expenses. Manage your budget. Stay in control.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A211C',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 36,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A211C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#B7CEC6',
    marginTop: 14,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 26,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#5EEAD4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandIconText: {
    color: '#0A211C',
    fontSize: 26,
    fontWeight: '900',
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },
  brandTagline: {
    color: '#B7CEC6',
    fontSize: 13,
    marginTop: 6,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#DCE8E3',
  },
  title: {
    color: '#10231D',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: '#64776F',
    fontSize: 13,
    marginTop: 7,
    marginBottom: 24,
    lineHeight: 19,
    textAlign: 'center',
  },
  label: {
    color: '#334B41',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
  },
  passwordContainer: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD8D1',
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 17,
    backgroundColor: '#FFFFFF',
  },
  inputInvalid: {
    borderColor: '#DC2626',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    color: '#10231D',
    fontSize: 14,
  },
  showPassword: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    paddingLeft: 8,
  },
  fieldError: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: -11,
    marginBottom: 13,
  },
  matchText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -10,
    marginBottom: 14,
  },
  statusIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 16,
  },
  statusIconText: {
    color: '#B91C1C',
    fontSize: 30,
    fontWeight: '800',
  },
  button: {
    height: 50,
    borderRadius: 11,
    backgroundColor: '#0F8A72',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#064E3B',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  secondaryButton: {
    height: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#C7D8D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    color: '#A8BDB4',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 22,
    lineHeight: 17,
  },
})
