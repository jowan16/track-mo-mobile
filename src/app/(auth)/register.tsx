import { StaticLoader } from '@/components/StaticLoader'
import { router } from 'expo-router'
import { useState } from 'react'
import {
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleRegister = async () => {
    if (loading) return

    const nextErrors: Record<string, string> = {}
    const normalizedName = fullName.trim()
    const normalizedEmail = email.trim()

    if (!normalizedName) nextErrors.fullName = 'Enter your name.'
    else if (normalizedName.length > 60) nextErrors.fullName = 'Name is too long (60 characters max).'

    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      nextErrors.email = 'Enter a valid email address.'
    }

    const passwordMessage =
      'Password must be at least 8 characters and include a letter and a number.'
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      nextErrors.password = passwordMessage
    }

    if (!confirmPassword || password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }

    if (!acceptedTerms) {
      nextErrors.terms = 'You must accept the terms to continue.'
    }

    setErrors(nextErrors)
    setBanner('')

    if (Object.keys(nextErrors).length > 0) return

    try {
      setLoading(true)

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: normalizedName },
          emailRedirectTo: 'trackmomobile://login',
        },
      })

      if (error) {
        if (/registered|exists/i.test(error.message)) {
          setErrors({ email: 'This email is already registered. Log in instead.' })
          return
        }
        setBanner(error.message)
        return
      }

      if (data.user && data.user.identities?.length === 0) {
        setErrors({ email: 'This email is already registered. Log in instead.' })
        return
      }

      // Registration must always return the user to the login screen.
      // Supabase may create a session immediately when email confirmation is disabled.
      if (data.session) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) throw signOutError
      }

      router.replace('/(auth)/login')
    } catch {
      setBanner('Something went wrong. Please try again.')
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
          <Text style={styles.brandTagline}>Start tracking today</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.description}>
            Create a free account to record expenses, set budgets and see simple reports.
          </Text>

          {banner ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorBannerText}>{banner}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={[styles.input, errors.fullName ? styles.inputInvalid : null]}
            value={fullName}
            onChangeText={(value) => {
              setFullName(value)
              setErrors((previous) => ({ ...previous, fullName: '' }))
            }}
            placeholder="Enter your full name"
            placeholderTextColor="#94A3B8"
            autoComplete="name"
            autoCapitalize="words"
            editable={!loading}
            maxLength={60}
          />
          {errors.fullName ? <Text style={styles.fieldError}>{errors.fullName}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email ? styles.inputInvalid : null]}
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              setErrors((previous) => ({ ...previous, email: '' }))
            }}
            placeholder="you@example.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}

          <Text style={styles.label}>Password</Text>
          <View style={[styles.passwordContainer, errors.password ? styles.inputInvalid : null]}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(value) => {
                setPassword(value)
                setErrors((previous) => ({ ...previous, password: '' }))
              }}
              placeholder="At least 8 characters, with a letter and number"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              autoCapitalize="none"
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowPassword((previous) => !previous)}
              disabled={loading}
              hitSlop={8}
            >
              <Text style={styles.showPassword}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          <Text style={styles.hint}>At least 8 characters, including a letter and a number.</Text>

          <Text style={styles.label}>Confirm password</Text>
          <View style={[styles.passwordContainer, errors.confirmPassword ? styles.inputInvalid : null]}>
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value)
                setErrors((previous) => ({ ...previous, confirmPassword: '' }))
              }}
              placeholder="Re-enter your password"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showConfirmPassword}
              autoComplete="new-password"
              autoCapitalize="none"
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowConfirmPassword((previous) => !previous)}
              disabled={loading}
              hitSlop={8}
            >
              <Text style={styles.showPassword}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}

          <View style={styles.termsRow}>
            <Pressable
              onPress={() => {
                setAcceptedTerms((previous) => !previous)
                setErrors((previous) => ({ ...previous, terms: '' }))
              }}
              disabled={loading}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
            >
              {acceptedTerms ? <Text style={styles.checkmark}>✓</Text> : null}
            </Pressable>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text
                style={styles.termsEmphasis}
                onPress={() => router.push('/(auth)/terms')}
                suppressHighlighting={false}
              >
                Terms
              </Text>
              {' '}and{' '}
              <Text
                style={styles.termsEmphasis}
                onPress={() => router.push('/(auth)/privacy-policy')}
                suppressHighlighting={false}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
          {errors.terms ? <Text style={styles.fieldError}>{errors.terms}</Text> : null}

          <Pressable
            style={[styles.button, loading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <StaticLoader color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign up</Text>
            )}
          </Pressable>

          <View style={styles.loginRow}>
            <Text style={styles.loginPrompt}>Already have an account? </Text>
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              disabled={loading}
            >
              <Text style={styles.loginLink}>Log in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A211C' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  brand: { alignItems: 'center', marginBottom: 22 },
  brandName: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' },
  brandTagline: { color: '#B7CEC6', fontSize: 13, marginTop: 6 },
  card: {
    width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#DCE8E3',
  },
  logo: { fontSize: 22, fontWeight: '800', color: '#0F766E', marginBottom: 18 },
  title: { fontSize: 23, fontWeight: '800', color: '#10231D' },
  description: { fontSize: 13, color: '#64776F', lineHeight: 20, marginTop: 7, marginBottom: 20 },
  errorBanner: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 16 },
  errorBannerText: { color: '#B91C1C', fontSize: 13, lineHeight: 19 },
  label: { color: '#334B41', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { height: 48, borderWidth: 1, borderColor: '#CBD8D1', borderRadius: 10, paddingHorizontal: 12, fontSize: 14, color: '#10231D', marginBottom: 14 },
  inputInvalid: { borderColor: '#DC2626' },
  passwordContainer: { minHeight: 49, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CBD8D1', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  passwordInput: { flex: 1, minHeight: 47, color: '#10231D', fontSize: 13 },
  showPassword: { color: '#0F766E', fontSize: 12, fontWeight: '700', paddingLeft: 8 },
  fieldError: { color: '#DC2626', fontSize: 12, marginTop: -8, marginBottom: 11 },
  hint: { color: '#718078', fontSize: 11, marginBottom: 14 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4, marginBottom: 8 },
  checkbox: { width: 19, height: 19, borderWidth: 1, borderColor: '#94A3B8', borderRadius: 4, marginRight: 9, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#0F8A72', borderColor: '#0F8A72' },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  termsText: { flex: 1, color: '#475569', fontSize: 12, lineHeight: 19 },
  termsEmphasis: { color: '#0F766E', fontWeight: '700', textDecorationLine: 'underline' },
  button: { height: 49, borderRadius: 11, backgroundColor: '#0F8A72', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabledButton: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 },
  loginPrompt: { color: '#64748B', fontSize: 13 },
  loginLink: { color: '#0F766E', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
})
