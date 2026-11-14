import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
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
import AsyncStorage from '@react-native-async-storage/async-storage'

import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/services/supabase'

const LOCK_KEY = 'tmpk_login_lock'
const MAX_TRIES = 5
const LOCK_MINUTES = 1
const LOCK_MS = LOCK_MINUTES * 60 * 1000
const LOCK_TEXT = `Too many attempts. Please try again in ${LOCK_MINUTES} minute${LOCK_MINUTES > 1 ? 's' : ''}.`
const GENERIC_ERROR =
  'Incorrect email or password. Please check your credentials and try again.'

type LoginLock = {
  tries?: number
  until?: number
}

async function readLock(): Promise<LoginLock> {
  try {
    const saved = await AsyncStorage.getItem(LOCK_KEY)
    return saved ? (JSON.parse(saved) as LoginLock) : {}
  } catch {
    return {}
  }
}

export default function LoginScreen() {
  const { signIn } = useAuth()
  const { verification } = useLocalSearchParams<{ verification?: string }>()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (verification === 'success') {
      setBanner('Your email has been verified successfully. You can now log in.')
    } else if (verification === 'error') {
      setBanner('We could not verify your email link. It may have expired or already been used. Request a new verification email and try again.')
    }
  }, [verification])

  const handleLogin = async () => {
    Keyboard.dismiss()
    setBanner('')
    setEmailError('')
    setPasswordError('')

    const normalizedEmail = email.trim()

    let hasValidationError = false

    if (!normalizedEmail) {
      setEmailError('Please enter your email address.')
      hasValidationError = true
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Please enter a valid email address.')
      hasValidationError = true
    }

    if (!password.trim()) {
      setPasswordError('Please enter your password.')
      hasValidationError = true
    }

    if (hasValidationError || loading) return

    const lock = await readLock()
    if (lock.until && lock.until > Date.now()) {
      setBanner(LOCK_TEXT)
      return
    }

    setLoading(true)

    try {
      const profile = await signIn(normalizedEmail, password)

      if (profile.status !== 'active') {
        setBanner(
          profile.status === 'suspended'
            ? 'Your account is suspended. Contact the administrator.'
            : 'Your account is not active. Contact the administrator.',
        )
        return
      }

      if (profile.role !== 'user' && profile.role !== 'admin') {
        setBanner('Your account has an invalid role. Please contact the administrator.')
        return
      }

      await AsyncStorage.removeItem(LOCK_KEY)

      if (profile.role === 'admin') {
        router.replace('/(admin)')
        return
      }

      // Decide the first user destination from the saved category selections.
      // Do this here, after sign-in, so the login flow does not race the root redirect.
      const { data: selectedCategories, error: categoryError } = await supabase
        .from('user_categories')
        .select('category_id')
        .eq('user_id', profile.id)
        .limit(1)

      if (categoryError) throw categoryError

      router.replace(
        selectedCategories && selectedCategories.length > 0
          ? '/(user)'
          : '/(user)/category-dashboard',
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'

      if (/email not confirmed|email_not_confirmed|verify your email/i.test(message)) {
        setBanner('Please verify your email address before logging in. Check your inbox for the verification link.')
        return
      }

      if (
        message.toLowerCase().includes('suspended') ||
        message.toLowerCase().includes('not active')
      ) {
        setBanner(
          message.toLowerCase().includes('suspended')
            ? 'Your account is suspended. Contact the administrator.'
            : 'Your account is not active. Contact the administrator.',
        )
        return
      }

      if (message.toLowerCase().includes('invalid role')) {
        setBanner('Your account has an invalid role. Please contact the administrator.')
        return
      }

      if (message.toLowerCase().includes('unable to verify your account')) {
        setBanner('Unable to verify your account information. Please contact the administrator.')
        return
      }

      const latestLock = await readLock()
      const tries = (latestLock.tries ?? 0) + 1

      if (tries >= MAX_TRIES) {
        await AsyncStorage.setItem(
          LOCK_KEY,
          JSON.stringify({
            tries: 0,
            until: Date.now() + LOCK_MS,
          }),
        )
        setBanner(LOCK_TEXT)
      } else {
        await AsyncStorage.setItem(
          LOCK_KEY,
          JSON.stringify({
            tries,
            until: 0,
          }),
        )
        setBanner(`${GENERIC_ERROR} ${MAX_TRIES - tries} attempts left.`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
      >
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>₱</Text>
          </View>
          <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
          <Text style={styles.brandTagline}>Your money. Your control.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.headingRow}>
            <View style={styles.headingCopy}>
              <Text style={styles.heading}>Welcome back</Text>
              <Text style={styles.description}>
                Log in to continue to Track Mo, Pake ko!
              </Text>
            </View>
          </View>

          {banner ? (
            <View style={styles.banner} accessibilityRole="alert">
              <Text style={styles.bannerText}>{banner}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <View style={[styles.inputContainer, emailError ? styles.inputInvalid : null]}>
            <Text style={styles.inputIcon}>✉</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={(value) => {
                setEmail(value)
                setEmailError('')
                setBanner('')
              }}
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              returnKeyType="next"
            />
          </View>
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputContainer, passwordError ? styles.inputInvalid : null]}>
            <Text style={styles.inputIcon}>▣</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={(value) => {
                setPassword(value)
                setPasswordError('')
                setBanner('')
              }}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              autoCapitalize="none"
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <Pressable
              onPress={() => setShowPassword((previous) => !previous)}
              disabled={loading}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Text style={styles.showPassword}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

          <Pressable
            style={styles.forgotContainer}
            onPress={() => {
              Keyboard.dismiss()
              router.navigate('/(auth)/forgot-password')
            }}
            hitSlop={12}
            accessibilityRole="link"
            accessibilityLabel="Forgot password"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={[styles.loginButton, loading && styles.disabledButton]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.loginButtonText}>Log in  ›</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>New to Track Mo?</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={styles.createButton}
            onPress={() => {
              Keyboard.dismiss()
              router.navigate('/(auth)/register')
            }}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Create an account"
          >
            <Text style={styles.createButtonText}>Create an account</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          Track your expenses. Manage your budget. Stay in control.
        </Text>
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
    position: 'relative',
    zIndex: 2,
    elevation: 2,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#DCE8E3',
  },
  headingRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headingCopy: {
    width: '100%',
    alignItems: 'center',
  },
  heading: {
    color: '#10231D',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: '#64776F',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
    textAlign: 'center',
  },
  banner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  bannerText: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    color: '#334B41',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
  },
  inputContainer: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD8D1',
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 18,
    backgroundColor: '#FFFFFF',
  },
  inputInvalid: {
    borderColor: '#DC2626',
  },
  inputIcon: {
    color: '#84968E',
    fontSize: 17,
    width: 26,
  },
  input: {
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
    marginTop: -13,
    marginBottom: 12,
  },
  forgotContainer: {
    alignSelf: 'flex-end',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 3,
    elevation: 3,
    marginTop: -5,
    marginBottom: 20,
  },
  forgotText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '700',
  },
  loginButton: {
    height: 50,
    borderRadius: 11,
    backgroundColor: '#0F8A72',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8E4',
  },
  dividerText: {
    color: '#718078',
    fontSize: 11,
  },
  createButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D8D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    color: '#A8BDB4',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 22,
    lineHeight: 17,
  },
})
