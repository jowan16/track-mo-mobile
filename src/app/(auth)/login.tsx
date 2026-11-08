
import { router } from 'expo-router'
import { useState } from 'react'
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

import { useAuth } from '@/context/AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing information', 'Please enter your email and password.')
      return
    }

    try {
      setLoading(true)

      const profile = await signIn(email, password)

      if (profile.role === 'admin') {
        router.replace('/(admin)')
      } else {
        router.replace('/(user)')
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to sign in. Please try again.'

      Alert.alert('Login failed', message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>Track Mo, Pake Ko!</Text>
          <Text style={styles.subtitle}>Your money. Your control.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.heading}>Welcome back!</Text>
          <Text style={styles.description}>
            Sign in to continue to your account.
          </Text>

          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
            />

            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Text style={styles.showPassword}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.forgotContainer}
            onPress={() => router.push('/(auth)/forgot-password')}
            disabled={loading}
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
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.registerContainer}
            onPress={() => router.push('/(auth)/register')}
            disabled={loading}
          >
            <Text style={styles.registerText}>
              Don't have an account? Create one
            </Text>
          </Pressable>

          <Text style={styles.footer}>
            Track your expenses. Manage your budget. Stay in control.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logo: {
    fontSize: 30,
    fontWeight: '800',
    color: '#2563EB',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  heading: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
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
  passwordContainer: {
    height: 50,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
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
  forgotContainer: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 13,
  },
  loginButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  registerContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  registerText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 13,
  },
  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 24,
    lineHeight: 18,
  },
})
