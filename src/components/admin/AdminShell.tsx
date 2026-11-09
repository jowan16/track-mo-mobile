import { router, useSegments } from 'expo-router'
import { useState, type ReactNode } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/context/AuthContext'

const links = [
  { label: 'Overview', route: '/(admin)' },
  { label: 'Users', route: '/(admin)/users' },
  { label: 'Default categories', route: '/(admin)/categories' },
  { label: 'Reports', route: '/(admin)/reports' },
  { label: 'Audit log', route: '/(admin)/audit' },
] as const

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const { profile, signOut } = useAuth()
  const segments = useSegments()
  const [signingOut, setSigningOut] = useState(false)
  const current = segments[1] ?? 'index'

  const activeRoute =
    current === 'index' ? '/(admin)' : `/(admin)/${current}`

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            setSigningOut(true)
            await signOut()
            router.replace('/(auth)/login')
          } catch (error) {
            Alert.alert(
              'Sign out failed',
              error instanceof Error ? error.message : 'Please try again.',
            )
          } finally {
            setSigningOut(false)
          }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>₱</Text>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.brand}>Track Mo, Pake Ko!</Text>
            <Text style={styles.brandSubtitle}>Administration</Text>
          </View>
          <Pressable
            style={styles.signOutButton}
            onPress={confirmSignOut}
            disabled={signingOut}
          >
            <Text style={styles.signOutText}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.adminName}>
          {profile?.full_name || profile?.email || 'Administrator'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.nav}
        >
          {links.map((item) => {
            const active = item.route === activeRoute
            return (
              <Pressable
                key={item.route}
                onPress={() => router.replace(item.route)}
                style={[styles.navItem, active && styles.navItemActive]}
              >
                <Text style={[styles.navText, active && styles.navTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeading}>
          <Text style={styles.pageTitle}>{title}</Text>
          {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export const adminColors = {
  primary: '#4F46E5',
  text: '#172033',
  muted: '#64748B',
  border: '#E2E8F0',
  background: '#F6F7FB',
  success: '#15803D',
  danger: '#B42318',
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminColors.background },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: adminColors.border,
    paddingTop: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: adminColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  brandText: { flex: 1 },
  brand: { color: adminColors.text, fontSize: 15, fontWeight: '900' },
  brandSubtitle: { color: adminColors.muted, fontSize: 10, marginTop: 2 },
  signOutButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  signOutText: { color: adminColors.danger, fontSize: 11, fontWeight: '800' },
  adminName: {
    color: adminColors.muted,
    fontSize: 11,
    paddingHorizontal: 16,
    paddingTop: 9,
  },
  nav: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, gap: 7 },
  navItem: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: '#F1F3F9',
  },
  navItemActive: { backgroundColor: adminColors.primary },
  navText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  navTextActive: { color: '#FFFFFF' },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 36, gap: 15 },
  pageHeading: { marginBottom: 1 },
  pageTitle: { color: adminColors.text, fontSize: 24, fontWeight: '900' },
  pageSubtitle: { color: adminColors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
})
