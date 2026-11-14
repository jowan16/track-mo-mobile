import { StaticLoader } from '@/components/StaticLoader'
import React, { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

import { UserPageHeader } from '@/components/user-navigation'
import { useAuth } from '@/context/AuthContext'
import { useAppTheme, type ThemePreference } from '@/context/ThemeContext'
import { supabase } from '@/services/supabase'

export default function SettingsScreen() {
  const { profile, refreshProfile, signOut } = useAuth()
  const { preference, resolvedTheme, setPreference } = useAppTheme()

  const dark = resolvedTheme === 'dark'

  const C = {
    background: dark ? '#101816' : '#f6f7f5',
    card: dark ? '#1b2421' : '#ffffff',
    text: dark ? '#f1f5f3' : '#14201c',
    muted: dark ? '#a0ada7' : '#64716b',
    border: dark ? '#34423c' : '#e4e8e5',
    brand: '#0f766e',
    danger: '#dc4444',
    input: dark ? '#26332e' : '#f8faf9',
  }

  const [editingProfile, setEditingProfile] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const [reminderTime, setReminderTime] = useState(
    profile?.daily_reminder_time?.slice(0, 5) ?? '08:00',
  )
  const [savingTime, setSavingTime] = useState(false)

  const [savingPreference, setSavingPreference] = useState(false)

  const updateProfile = async (values: Record<string, unknown>) => {
    if (!profile?.id) throw new Error('Your profile could not be loaded.')

    const { error } = await supabase
      .from('profiles')
      .update(values)
      .eq('id', profile.id)

    if (error) throw error

    await refreshProfile()
  }

  const handleSaveProfile = async () => {
    const name = fullName.trim()

    if (!name) {
      Alert.alert('Required field', 'Please enter your full name.')
      return
    }

    if (name.length > 60) {
      Alert.alert('Invalid name', 'Your name must not exceed 60 characters.')
      return
    }

    try {
      setSavingProfile(true)
      await updateProfile({ full_name: name })
      setEditingProfile(false)
      Alert.alert('Success', 'Your profile has been updated.')
    } catch (error) {
      Alert.alert(
        'Update failed',
        error instanceof Error ? error.message : 'Unable to update your profile.',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      Alert.alert(
        'Invalid password',
        'Use at least 8 characters, including a letter and a number.',
      )
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Your passwords do not match.')
      return
    }

    try {
      setSavingPassword(true)

      const { error } = await supabase.auth.updateUser({ password })

      if (error) throw error

      setPassword('')
      setConfirmPassword('')

      Alert.alert('Success', 'Your password has been changed.')
    } catch (error) {
      Alert.alert(
        'Password update failed',
        error instanceof Error ? error.message : 'Unable to update your password.',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  const handleNotificationChange = async (
    field: 'email_alerts' | 'warn_80' | 'warn_100' | 'daily_reminder',
    value: boolean,
  ) => {
    try {
      setSavingPreference(true)
      await updateProfile({ [field]: value })
    } catch (error) {
      Alert.alert(
        'Update failed',
        error instanceof Error ? error.message : 'Unable to save this preference.',
      )
    } finally {
      setSavingPreference(false)
    }
  }

  const handleSaveReminderTime = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
      Alert.alert('Invalid time', 'Enter a valid time in HH:MM format.')
      return
    }

    try {
      setSavingTime(true)
      await updateProfile({ daily_reminder_time: `${reminderTime}:00` })
      Alert.alert('Success', 'Your reminder time has been updated.')
    } catch (error) {
      Alert.alert(
        'Update failed',
        error instanceof Error ? error.message : 'Unable to save reminder time.',
      )
    } finally {
      setSavingTime(false)
    }
  }

  const handleThemeChange = async (value: ThemePreference) => {
    try {
      await setPreference(value)
    } catch {
      Alert.alert('Error', 'Unable to save your appearance preference.')
    }
  }

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut()
            router.replace('/(auth)/login')
          } catch (error) {
            Alert.alert(
              'Log out failed',
              error instanceof Error ? error.message : 'Unable to log out.',
            )
          }
        },
      },
    ])
  }

  const styles = makeStyles(C)

  const Section = ({ title, children }: {
    title: string
    children: React.ReactNode
  }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  )

  const PreferenceSwitch = ({
    title,
    description,
    value,
    onValueChange,
  }: {
    title: string
    description: string
    value: boolean
    onValueChange: (value: boolean) => void
  }) => (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={savingPreference}
        trackColor={{ false: dark ? '#46534d' : '#d5ddd8', true: '#0f766e' }}
        thumbColor="#ffffff"
      />
    </View>
  )

  if (!profile) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <StaticLoader size="large" color={C.brand} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <UserPageHeader title="Settings" subtitle="Manage your account and preferences" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Section title="MY ACCOUNT">
            <View style={styles.accountHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(profile.full_name || profile.email || 'U')
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.accountInfo}>
                <Text style={styles.itemTitle}>
                  {profile.full_name || 'Your Name'}
                </Text>
                <Text style={styles.description}>{profile.email}</Text>
              </View>
            </View>

            <View style={styles.separator} />

            {editingProfile ? (
              <>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor={C.muted}
                  maxLength={60}
                  style={styles.input}
                />

                <View style={styles.buttonRow}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      setFullName(profile.full_name ?? '')
                      setEditingProfile(false)
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    {savingProfile
                      ? <StaticLoader color="#fff" />
                      : <Text style={styles.primaryButtonText}>Save Changes</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Full Name</Text>
                <Text style={styles.value}>{profile.full_name || 'Not set'}</Text>

                <Text style={styles.label}>Email Address</Text>
                <Text style={styles.value}>{profile.email || 'Not available'}</Text>

                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    setFullName(profile.full_name ?? '')
                    setEditingProfile(true)
                  }}
                >
                  <Text style={styles.outlineButtonText}>Edit Profile</Text>
                </Pressable>
              </>
            )}
            <View style={styles.separator} />

            <Text style={styles.itemTitle}>SECURITY</Text>
            <Text style={styles.description}>
              Change your account password. You will remain signed in.
            </Text>

            <Text style={styles.label}>New Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={C.muted}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter your new password"
              placeholderTextColor={C.muted}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />

            <Pressable
              style={styles.primaryButton}
              onPress={handleChangePassword}
              disabled={savingPassword || !password || !confirmPassword}
            >
              {savingPassword
                ? <StaticLoader color="#fff" />
                : <Text style={styles.primaryButtonText}>Update Password</Text>}
            </Pressable>
          </Section>

          <Section title="APPEARANCE">
            <Text style={styles.description}>
              Choose how Track Mo looks on your device.
            </Text>

            <View style={styles.themeOptions}>
              {([
                ['light', '☀', 'Light'],
                ['dark', '☾', 'Dark'],
              ] as const).map(([value, icon, label]) => {
                const selected = preference === value

                return (
                  <Pressable
                    key={value}
                    style={[
                      styles.themeOption,
                      selected && styles.themeOptionSelected,
                    ]}
                    onPress={() => handleThemeChange(value)}
                  >
                    <Text style={[
                      styles.themeIcon,
                      selected && styles.selectedText,
                    ]}>
                      {icon}
                    </Text>
                    <Text style={[
                      styles.themeLabel,
                      selected && styles.selectedText,
                    ]}>
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </Section>

          <Section title="NOTIFICATIONS">
            <PreferenceSwitch
              title="Email Budget Alerts"
              description="Master switch for all budget-warning emails. Turn this off to stop 80% and 100% email alerts."
              value={profile.email_alerts}
              onValueChange={(value) =>
                handleNotificationChange('email_alerts', value)}
            />

            <View style={styles.separator} />

            <PreferenceSwitch
              title="80% Budget Warning"
              description="Show the 80% warning in each category and allow its email alert when Email Budget Alerts is on."
              value={profile.warn_80}
              onValueChange={(value) =>
                handleNotificationChange('warn_80', value)}
            />

            <View style={styles.separator} />

            <PreferenceSwitch
              title="100% Budget Warning"
              description="Show the 100% warning in each category and allow its email alert when Email Budget Alerts is on."
              value={profile.warn_100}
              onValueChange={(value) =>
                handleNotificationChange('warn_100', value)}
            />

            <View style={styles.separator} />

            <PreferenceSwitch
              title="Daily Reminder"
              description="Receive a daily reminder to track your expenses."
              value={profile.daily_reminder}
              onValueChange={(value) =>
                handleNotificationChange('daily_reminder', value)}
            />

            {profile.daily_reminder && (
              <>
                <View style={styles.separator} />
                <Text style={styles.label}>Daily Reminder Time (24-hour)</Text>
                <View style={styles.timeRow}>
                  <TextInput
                    value={reminderTime}
                    onChangeText={setReminderTime}
                    placeholder="08:00"
                    placeholderTextColor={C.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={[styles.input, styles.timeInput]}
                  />
                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleSaveReminderTime}
                    disabled={savingTime}
                  >
                    {savingTime
                      ? <StaticLoader color="#fff" />
                      : <Text style={styles.primaryButtonText}>Save Time</Text>}
                  </Pressable>
                </View>
                <Text style={styles.description}>
                  Time zone: {profile.daily_reminder_timezone || 'Not configured'}
                </Text>
              </>
            )}

            {savingPreference && (
              <Text style={styles.savingText}>Saving preference...</Text>
            )}
          </Section>

          <Section title="ACCOUNT">
            <Text style={styles.description}>
              Sign out of your Track Mo account on this device.
            </Text>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </Pressable>
          </Section>

          <Text style={styles.footer}>
            Track Mo, Pake Ko! · Account Settings
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function makeStyles(C: {
  background: string
  card: string
  text: string
  muted: string
  border: string
  brand: string
  danger: string
  input: string
}) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.background },
    center: { justifyContent: 'center', alignItems: 'center' },
    header: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      minHeight: 72,
      backgroundColor: C.card,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerText: {
      position: 'absolute',
      left: 72,
      right: 72,
      alignItems: 'center',
    },
    headerSpacer: { width: 44, height: 44 },
    title: { fontSize: 24, fontWeight: '800', color: C.text, textAlign: 'center' },
    subtitle: { fontSize: 12, color: C.muted, marginTop: 3, textAlign: 'center' },
    content: { padding: 18, paddingBottom: 40, gap: 20 },
    section: { gap: 10 },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      color: C.muted,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      gap: 12,
    },
    accountHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
    accountInfo: { flex: 1, gap: 4 },
    itemTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
    description: { color: C.muted, fontSize: 12, lineHeight: 18 },
    separator: { height: 1, backgroundColor: C.border },
    label: {
      color: C.muted,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 3,
    },
    value: { color: C.text, fontSize: 14 },
    input: {
      backgroundColor: C.input,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: C.text,
      fontSize: 14,
    },
    buttonRow: { flexDirection: 'row', gap: 10 },
    primaryButton: {
      backgroundColor: C.brand,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    secondaryButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      padding: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: { color: C.text, fontWeight: '700', fontSize: 13 },
    outlineButton: {
      borderWidth: 1,
      borderColor: C.brand,
      borderRadius: 10,
      padding: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    outlineButtonText: { color: C.brand, fontWeight: '800', fontSize: 13 },
    themeOptions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    themeOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      backgroundColor: C.input,
    },
    themeOptionSelected: {
      borderColor: C.brand,
      backgroundColor: C.brand,
    },
    themeIcon: { color: C.text, fontSize: 19 },
    themeLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
    selectedText: { color: '#fff' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    switchText: { flex: 1, gap: 4 },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    timeInput: { flex: 1 },
    savingText: { color: C.muted, fontSize: 11 },
    logoutButton: {
      borderWidth: 1,
      borderColor: C.danger,
      borderRadius: 10,
      padding: 13,
      alignItems: 'center',
    },
    logoutButtonText: { color: C.danger, fontWeight: '800', fontSize: 14 },
    footer: {
      textAlign: 'center',
      color: C.muted,
      fontSize: 11,
      marginTop: 4,
    },
  })
}
