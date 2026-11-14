import { StaticLoader } from '@/components/StaticLoader'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
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

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [sentEmail, setSentEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const sendResetLink = async (address: string) => {
    setEmailError('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: 'trackmomobile://reset-password',
      })

      // Match the web app: do not reveal whether an email is registered.
      if (error) {
        Alert.alert('Unable to send reset link', error.message || 'Please try again.')
        return
      }

      setSentEmail(address)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setEmailError('Enter your email address.')
      return
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailError('Enter a valid email address.')
      return
    }

    await sendResetLink(normalizedEmail)
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
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.description}>
            Enter your email and we will send you a link to choose a new one.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputInvalid : null]}
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              setEmailError('')
              setSentEmail('')
            }}
            placeholder="you@example.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <Pressable
            style={[styles.button, loading && styles.disabledButton]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? (
              <StaticLoader color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Send reset link</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/(auth)/login')}
            disabled={loading}
          >
            <Text style={styles.backText}>Back to log in</Text>
          </Pressable>
        </View>

        {sentEmail ? (
          <View style={styles.successBanner} >
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successText}>
              If this email is registered, a reset link is on its way. The link expires in 30 minutes.
            </Text>
            <Pressable
              style={styles.resendButton}
              onPress={() => void sendResetLink(sentEmail)}
              disabled={loading}
            >
              <Text style={styles.resendText}>
                {loading ? 'Sending...' : 'Resend link'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A211C' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  brand: { alignItems: 'center', marginBottom: 24 },
  brandName: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: '#DCE8E3',
  },
  title: { fontSize: 23, fontWeight: '800', color: '#10231D' },
  description: { fontSize: 14, color: '#64776F', lineHeight: 21, marginTop: 8, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#334B41', marginBottom: 7 },
  input: {
    height: 50, borderWidth: 1, borderColor: '#CBD8D1', borderRadius: 11,
    paddingHorizontal: 13, fontSize: 14, color: '#10231D', marginBottom: 18,
  },
  inputInvalid: { borderColor: '#DC2626', marginBottom: 6 },
  fieldError: { color: '#DC2626', fontSize: 12, marginBottom: 14 },
  button: {
    height: 50, borderRadius: 11, backgroundColor: '#0F8A72',
    alignItems: 'center', justifyContent: 'center',
  },
  disabledButton: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  backButton: { alignItems: 'center', marginTop: 20 },
  backText: { color: '#0F766E', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  successBanner: {
    width: '100%', maxWidth: 460, alignSelf: 'center', marginTop: 16,
    borderWidth: 1, borderColor: '#86EFAC', backgroundColor: '#F0FDF4',
    borderRadius: 12, padding: 16,
  },
  successTitle: { color: '#166534', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  successText: { color: '#166534', fontSize: 13, lineHeight: 19 },
  resendButton: { alignSelf: 'flex-start', marginTop: 12 },
  resendText: { color: '#0F766E', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
})
