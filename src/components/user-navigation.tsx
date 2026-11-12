import React, { createContext, useContext, useState } from 'react'
import {
  Image,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { useAppTheme } from '@/context/ThemeContext'

type DrawerContextType = {
  openDrawer: () => void
}

const DrawerContext = createContext<DrawerContextType | null>(null)

export function useUserDrawer() {
  const context = useContext(DrawerContext)

  if (!context) {
    throw new Error('useUserDrawer must be used inside UserDrawerProvider')
  }

  return context
}

export function UserDrawerProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const { profile, signOut } = useAuth()
  const { resolvedTheme } = useAppTheme()
  const styles = makeStyles(resolvedTheme === 'dark')

  const closeDrawer = () => setVisible(false)

  const navigate = (path: string) => {
    closeDrawer()
    router.push(path as any)
  }

  const handleMenuPress = (label: string, path: string, available: boolean) => {
    if (available) {
      navigate(path)
      return
    }

    Alert.alert(
      label,
      `${label} is not available yet. We'll add this screen next.`,
    )
  }

  const handleSignOut = () => {
    closeDrawer()

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
              error instanceof Error
                ? error.message
                : 'Unable to log out. Please try again.',
            )
          }
        },
      },
    ])
  }

  const menuItems = [
    {
      label: 'Dashboard',
      icon: '⌂',
      path: '/(user)',
      available: true,
    },
    {
      label: 'Budgets',
      icon: '▤',
      path: '/(user)/budgets',
      available: true,
    },
    {
      label: 'Expenses',
      icon: '₱',
      path: '/(user)/expenses',
      available: true,
    },
    {
      label: 'Reports',
      icon: '▥',
      path: '/(user)/reports',
      available: true,
    },
    {
      label: 'Financial Literacy',
      icon: '▱',
      path: '/(user)/learn',
      available: true,
    },
    {
      label: 'Archive',
      icon: '▣',
      path: '/(user)/archive',
      available: true,
    },
    {
      label: 'Settings',
      icon: '⚙',
      path: '/(user)/settings',
      available: true,
    },
  ]

  return (
    <DrawerContext.Provider value={{ openDrawer: () => setVisible(true) }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeDrawer}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={closeDrawer}
            accessibilityLabel="Close navigation menu"
          />

          <View style={styles.drawer}>
            {/* BRAND */}

            <View style={styles.brandHeader}>
              <View style={styles.brandMark}>
                <Image source={require('../../assets/trackmo-logo.png')} style={{ width: 38, height: 38 }} resizeMode="contain" />
              </View>

              <Text style={styles.brandName}>Track Mo, Pake Ko!</Text>

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

            {/* NAVIGATION */}

            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuContent}
              showsVerticalScrollIndicator={false}
            >
              {menuItems.map((item) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [
                    styles.menuItem,
                    item.label === 'Dashboard' && styles.activeMenuItem,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() =>
                    handleMenuPress(item.label, item.path, item.available)
                  }
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.menuIcon,
                      item.label === 'Dashboard' && styles.activeMenuIcon,
                    ]}
                  >
                    {item.icon}
                  </Text>
                  <Text
                    style={[
                      styles.menuText,
                      item.label === 'Dashboard' && styles.activeMenuText,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* ACCOUNT FOOTER */}

            <View style={styles.accountFooter}>
              <View style={styles.separator} />

              <Text style={styles.signedInLabel}>Signed in as</Text>

              <Text style={styles.profileName} numberOfLines={2}>
                {profile?.full_name || 'User'}
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.logoutButton,
                  pressed && styles.logoutPressed,
                ]}
                onPress={handleSignOut}
                accessibilityRole="button"
              >
                <Text style={styles.logoutIcon}>↪</Text>
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </DrawerContext.Provider>
  )
}

export function UserMenuButton() {
  const { openDrawer } = useUserDrawer()
  const { resolvedTheme } = useAppTheme()
  const styles = makeStyles(resolvedTheme === 'dark')

  return (
    <Pressable
      onPress={openDrawer}
      style={styles.menuButton}
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
    >
      <Text style={styles.menuButtonText}>☰</Text>
    </Pressable>
  )
}

function makeStyles(dark: boolean) {
  const palette = {
    drawer: dark ? '#151f1b' : '#ffffff',
    text: dark ? '#f1f5f3' : '#14201c',
    muted: dark ? '#a0ada7' : '#4b5754',
    border: dark ? '#34423c' : '#e8eeeb',
    subtle: dark ? '#26332e' : '#f1f5f3',
    active: dark ? '#173d37' : '#e6f4f1',
    pressed: dark ? '#26332e' : '#f1f5f3',
    brand: '#0f766e',
    dangerBg: dark ? '#3a2423' : '#fff1f0',
    dangerPressed: dark ? '#4a2b29' : '#ffe2df',
    danger: '#ef7770',
  }
  return StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 20, 17, 0.42)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  drawer: {
    width: '82%',
    maxWidth: 340,
    height: '100%',
    backgroundColor: palette.drawer,
    paddingTop: 58,
    paddingHorizontal: 20,
    paddingBottom: 24,
    zIndex: 1,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: palette.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  brandName: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 11,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: palette.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: palette.muted,
    fontSize: 25,
    lineHeight: 29,
  },
  separator: {
    height: 1,
    backgroundColor: palette.border,
  },
  menuScroll: {
    flex: 1,
    marginTop: 18,
  },
  menuContent: {
    gap: 6,
    paddingBottom: 20,
  },
  menuItem: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderRadius: 11,
  },
  activeMenuItem: {
    backgroundColor: palette.active,
  },
  menuItemPressed: {
    backgroundColor: palette.subtle,
  },
  menuIcon: {
    width: 30,
    color: palette.muted,
    fontSize: 21,
    fontWeight: '700',
  },
  activeMenuIcon: {
    color: '#0f766e',
  },
  menuText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  activeMenuText: {
    color: '#0f766e',
    fontWeight: '800',
  },
  accountFooter: {
    paddingTop: 15,
  },
  signedInLabel: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 17,
  },
  profileName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 16,
  },
  logoutButton: {
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: palette.dangerBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 10,
  },
  logoutPressed: {
    backgroundColor: palette.dangerPressed,
  },
  logoutIcon: {
    color: palette.danger,
    fontSize: 19,
    fontWeight: '800',
  },
  logoutText: {
    color: palette.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: palette.active,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    color: '#0f766e',
    fontSize: 22,
    fontWeight: '800',
  },
  })
}
