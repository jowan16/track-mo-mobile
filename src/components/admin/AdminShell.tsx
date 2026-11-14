import { router, useSegments } from 'expo-router'
import { useState, type ReactNode } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/context/AuthContext'

const links = [
  { label: 'Overview', route: '/(admin)', icon: '⌂' },
  { label: 'Users', route: '/(admin)/users', icon: '♙' },
  { label: 'Default categories', route: '/(admin)/categories', icon: '▦' },
  { label: 'Reports', route: '/(admin)/reports', icon: '▥' },
  { label: 'Audit log', route: '/(admin)/audit', icon: '▤' },
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
  const [drawerVisible, setDrawerVisible] = useState(false)
  const current = segments[1] ?? 'index'
  const activeRoute =
    current === 'index' ? '/(admin)' : `/(admin)/${current}`

  const closeDrawer = () => setDrawerVisible(false)

  const confirmSignOut = () => {
    closeDrawer()
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
          <Pressable
            style={styles.menuButton}
            onPress={() => setDrawerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open admin navigation menu"
          >
            <Text style={styles.menuButtonText}>☰</Text>
          </Pressable>
          <View style={styles.brandText}>
            <Text style={styles.brand} numberOfLines={2}>{title}</Text>
            {subtitle ? <Text style={styles.brandSubtitle}>{subtitle}</Text> : null}
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <Modal
        visible={drawerVisible}
        transparent
        animationType="none"
        onRequestClose={closeDrawer}
        statusBarTranslucent
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            style={styles.backdrop}
            onPress={closeDrawer}
            accessibilityLabel="Close navigation menu"
          />
          <View style={styles.drawer}>
            <View style={styles.drawerBrandRow}>
              <View style={styles.drawerBrandMark}>
                <Text style={styles.drawerBrandMarkText}>₱</Text>
              </View>
              <View style={styles.drawerBrandText}>
                <Text style={styles.drawerBrand}>Track Mo, Pake Ko!</Text>
                <Text style={styles.drawerBrandSubtitle}>Administration</Text>
              </View>
              <Pressable
                onPress={closeDrawer}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.separator} />

            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuContent}
              showsVerticalScrollIndicator={false}
            >
              {links.map((item) => {
                const active = item.route === activeRoute
                return (
                  <Pressable
                    key={item.route}
                    onPress={() => {
                      closeDrawer()
                      router.replace(item.route)
                    }}
                    style={[styles.menuItem, active && styles.activeMenuItem]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.menuIcon, active && styles.activeMenuIcon]}>
                      {item.icon}
                    </Text>
                    <Text style={[styles.menuText, active && styles.activeMenuText]}>
                      {item.label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={styles.accountFooter}>
              <View style={styles.separator} />
              <Text style={styles.signedInLabel}>Signed in as</Text>
              <Text style={styles.profileName} numberOfLines={2}>
                {profile?.full_name || profile?.email || 'Administrator'}
              </Text>
              <Pressable
                style={styles.drawerSignOutButton}
                onPress={confirmSignOut}
                disabled={signingOut}
                accessibilityRole="button"
              >
                <Text style={styles.drawerSignOutIcon}>↪</Text>
                <Text style={styles.drawerSignOutText}>
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: { color: adminColors.primary, fontSize: 22, fontWeight: '800' },
  brandText: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  brand: { color: adminColors.text, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  brandSubtitle: { color: adminColors.muted, fontSize: 10, lineHeight: 14, marginTop: 3, textAlign: 'center' },
  headerSpacer: { width: 42, height: 42 },
  body: { flex: 1 },
  bodyContent: { padding: 16, paddingBottom: 36, gap: 15 },
  pageHeading: { marginBottom: 1 },
  pageTitle: { color: adminColors.text, fontSize: 24, fontWeight: '900' },
  pageSubtitle: { color: adminColors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 20, 17, 0.42)',
  },
  backdrop: { ...StyleSheet.absoluteFill },
  drawer: {
    width: '82%',
    maxWidth: 340,
    height: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 24,
    zIndex: 1,
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  drawerBrandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: adminColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBrandMarkText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  drawerBrandText: { flex: 1, marginLeft: 11 },
  drawerBrand: { color: adminColors.text, fontSize: 15, fontWeight: '800' },
  drawerBrandSubtitle: { color: adminColors.muted, fontSize: 10, marginTop: 2 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#475569', fontSize: 25, lineHeight: 29 },
  separator: { height: 1, backgroundColor: '#E8EEEB' },
  menuScroll: { flex: 1, marginTop: 18 },
  menuContent: { gap: 6, paddingBottom: 20 },
  menuItem: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderRadius: 11,
  },
  activeMenuItem: { backgroundColor: '#EEF2FF' },
  menuIcon: { width: 30, color: '#68756F', fontSize: 21, fontWeight: '700' },
  activeMenuIcon: { color: adminColors.primary },
  menuText: { color: '#34413B', fontSize: 14, fontWeight: '600' },
  activeMenuText: { color: adminColors.primary, fontWeight: '800' },
  accountFooter: { paddingTop: 15 },
  signedInLabel: { color: '#7B8782', fontSize: 12, marginTop: 17 },
  profileName: {
    color: adminColors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 16,
  },
  drawerSignOutButton: {
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: '#FFF1F0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 10,
  },
  drawerSignOutIcon: { color: adminColors.danger, fontSize: 19, fontWeight: '800' },
  drawerSignOutText: { color: adminColors.danger, fontSize: 14, fontWeight: '700' },
})
