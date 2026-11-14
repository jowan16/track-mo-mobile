import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
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

const AUTH_REDIRECT_URL = 'trackmomobile://verify-email'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type VerificationErrorType =
  | 'invalid'
  | 'expired'
  | 'already-used'
  | 'missing'
  | 'verification'

const ERROR_CONTENT: Record<VerificationErrorType, { title: string; message: string }> = {
  invalid: {
    title: 'Invalid Verification Link',
    message: 'This verification link is invalid. Please request a new verification email.',
  },
  expired: {
    title: 'Verification Link Expired',
    message: 'Your verification link has expired. Please request a new verification email.',
  },
  'already-used': {
    title: 'Verification Link Already Used',
    message: 'This verification link has already been used. If you already verified your email, you can log in. Otherwise, request a new verification email.',
  },
  missing: {
    title: 'Verification Token Missing',
    message: 'The verification link is missing a valid token. Please request a new verification email.',
  },
  verification: {
    title: 'Verification Failed',
    message: "We couldn't verify your email address. Please try again.",
  },
}

export default function VerifyEmailScreen() {
  const { status, errorType } = useLocalSearchParams<{
    status?: string
    errorType?: string
  }>()
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const isSuccess = status === 'success'
  const errorContent = useMemo(() => {
    const key = (errorType ?? 'verification') as VerificationErrorType
    return ERROR_CONTENT[key] ?? ERROR_CONTENT.verification
  }, [errorType])

  const handleResend = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setFeedback({ type: 'error', message: 'Enter a valid email address to request a new verification link.' })
      return
    }

    setResending(true)
    setFeedback(null)

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: { emailRedirectTo: AUTH_REDIRECT_URL },
      })
      if (error) throw error

      setFeedback({
        type: 'success',
        message: 'If this account still needs verification, a new email has been requested. Check your inbox and spam folder.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
      const combined = `${code} ${message}`.toLowerCase()

      const friendlyMessage = /already confirmed|already verified|email_confirmed|user_already_exists/.test(combined)
        ? 'This email address may already be verified. Try logging in.'
        : /rate limit|too many requests|over_email_send_rate_limit|429/.test(combined)
          ? 'A verification email was requested recently. Please wait at least 60 seconds before trying again.'
          : /email address not authorized|email_address_not_authorized/.test(combined)
            ? 'The email provider is not authorized to send to this address. Check your Supabase SMTP configuration.'
            : /smtp|email provider|mail send|failed to send/.test(combined)
              ? 'The email service could not send the message. Please try again later.'
              : 'Unable to request a new verification email. Please check the address and try again.'

      setFeedback({ type: 'error', message: friendlyMessage })
    } finally {
      setResending(false)
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
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>₱</Text>
          </View>
          <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>
          <Text style={styles.brandTagline}>Your money. Your control.</Text>
        </View>

        <View style={styles.card}>
          <View style={[styles.statusIcon, isSuccess ? styles.successIcon : styles.errorIcon]}>
            <Text style={[styles.statusIconText, isSuccess ? styles.successIconText : styles.errorIconText]}>
              {isSuccess ? '✓' : '!'}
            </Text>
          </View>

          <Text style={styles.eyebrow}>{isSuccess ? 'EMAIL VERIFICATION COMPLETE' : 'EMAIL VERIFICATION'}</Text>
          <Text style={styles.title}>
            {isSuccess ? 'Email Verified Successfully' : errorContent.title}
          </Text>
          <Text style={styles.message}>
            {isSuccess
              ? 'Your email has been successfully verified! You can now log in to your account.'
              : errorContent.message}
          </Text>

          {!isSuccess ? (
            <View style={styles.resendSection}>
              <Text style={styles.resendTitle}>Need another verification link?</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(value) => {
                  setEmail(value)
                  setFeedback(null)
                }}
                placeholder="Enter your email address"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!resending}
              />
              {feedback ? (
                <View style={[styles.feedback, feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError]} accessibilityRole="alert">
                  <Text style={[styles.feedbackText, feedback.type === 'success' ? styles.feedbackSuccessText : styles.feedbackErrorText]}>
                    {feedback.message}
                  </Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.resendButton, resending && styles.disabledButton]}
                onPress={handleResend}
                disabled={resending}
                accessibilityRole="button"
              >
                {resending
                  ? <ActivityIndicator color="#0F766E" />
                  : <Text style={styles.resendButtonText}>Resend Verification Email</Text>}
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={styles.loginButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="button"
          >
            <Text style={styles.loginButtonText}>Back to Login</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Track your expenses. Manage your budget. Stay in control.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A211C' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  brand: { alignItems: 'center', marginBottom: 24 },
  brandIcon: {
    width: 48, height: 48, borderRadius: 15, backgroundColor: '#5EEAD4',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  brandIconText: { color: '#0A211C', fontSize: 26, fontWeight: '900' },
  brandName: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' },
  brandTagline: { color: '#B7CEC6', fontSize: 13, marginTop: 6 },
  card: {
    width: '100%', maxWidth: 460, alignSelf: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 22, padding: 24, borderWidth: 1, borderColor: '#DCE8E3',
    alignItems: 'center',
  },
  statusIcon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center',
    justifyContent: 'center', marginBottom: 18,
  },
  successIcon: { backgroundColor: '#DCFCE7' },
  errorIcon: { backgroundColor: '#FEE2E2' },
  statusIconText: { fontSize: 40, fontWeight: '900' },
  successIconText: { color: '#15803D' },
  errorIconText: { color: '#B91C1C' },
  eyebrow: {
    color: '#0F8A72', fontSize: 10, fontWeight: '800',
    letterSpacing: 1.4, textAlign: 'center', marginBottom: 8,
  },
  title: { color: '#10231D', fontSize: 22, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  message: { color: '#52645C', fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  resendSection: { width: '100%', marginTop: 24 },
  resendTitle: { color: '#334B41', fontSize: 13, fontWeight: '700', marginBottom: 9 },
  input: {
    width: '100%', height: 48, borderWidth: 1, borderColor: '#CBD8D1',
    borderRadius: 10, paddingHorizontal: 12, color: '#10231D', fontSize: 14,
  },
  feedback: { borderWidth: 1, borderRadius: 10, padding: 11, marginTop: 12 },
  feedbackSuccess: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  feedbackError: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  feedbackText: { fontSize: 12, lineHeight: 18 },
  feedbackSuccessText: { color: '#166534' },
  feedbackErrorText: { color: '#B91C1C' },
  resendButton: {
    minHeight: 48, borderRadius: 10, borderWidth: 1.5, borderColor: '#0F8A72',
    alignItems: 'center', justifyContent: 'center', marginTop: 12, padding: 12,
  },
  resendButtonText: { color: '#0F766E', fontSize: 13, fontWeight: '800' },
  disabledButton: { opacity: 0.65 },
  loginButton: {
    width: '100%', minHeight: 50, borderRadius: 11, backgroundColor: '#0F8A72',
    alignItems: 'center', justifyContent: 'center', marginTop: 22, padding: 13,
  },
  loginButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  footer: { color: '#A8BDB4', fontSize: 11, textAlign: 'center', marginTop: 22, lineHeight: 17 },
})
