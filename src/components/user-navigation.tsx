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
  const [expensesExpanded, setExpensesExpanded] = useState(false)
  const { profile, signOut } = useAuth()

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
                <React.Fragment key={item.label}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.menuItem,
                      item.label === 'Dashboard' && styles.activeMenuItem,
                      pressed && styles.menuItemPressed,
                    ]}
                    onPress={() => {
                      if (item.label === 'Expenses') {
                        setExpensesExpanded((previous) => !previous)
                        return
                      }

                      handleMenuPress(
                        item.label,
                        item.path,
                        item.available,
                      )
                    }}
                    accessibilityRole="button"
                    accessibilityState={
                      item.label === 'Expenses'
                        ? { expanded: expensesExpanded }
                        : undefined
                    }
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

                    {item.label === 'Expenses' ? (
                      <Text style={styles.expensesChevron}>
                        {expensesExpanded ? '⌃' : '⌄'}
                      </Text>
                    ) : null}
                  </Pressable>

                  {item.label === 'Expenses' && expensesExpanded ? (
                    <View style={styles.expensesSubmenu}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.expensesSubmenuItem,
                          pressed && styles.menuItemPressed,
                        ]}
                        onPress={() =>
                          navigate('/(user)/expenses?openForm=1')
                        }
                        accessibilityRole="button"
                      >
                        <Text style={styles.expensesSubmenuIcon}>＋</Text>
                        <Text style={styles.expensesSubmenuText}>
                          Add Expense
                        </Text>
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [
                          styles.expensesSubmenuItem,
                          pressed && styles.menuItemPressed,
                        ]}
                        onPress={() =>
                          navigate('/(user)/scan-receipt')
                        }
                        accessibilityRole="button"
                      >
                        <Text style={styles.expensesSubmenuIcon}>▧</Text>
                        <Text style={styles.expensesSubmenuText}>
                          Scan Receipts
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </React.Fragment>
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

const styles = StyleSheet.create({
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#0f766e',
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
    color: '#14201c',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 11,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f1f5f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#4b5754',
    fontSize: 25,
    lineHeight: 29,
  },
  separator: {
    height: 1,
    backgroundColor: '#e8eeeb',
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
    backgroundColor: '#e6f4f1',
  },
  menuItemPressed: {
    backgroundColor: '#f1f5f3',
  },
  menuIcon: {
    width: 30,
    color: '#68756f',
    fontSize: 21,
    fontWeight: '700',
  },
  activeMenuIcon: {
    color: '#0f766e',
  },
  menuText: {
    color: '#34413b',
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
    color: '#7b8782',
    fontSize: 12,
    marginTop: 17,
  },
  profileName: {
    color: '#14201c',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 16,
  },
  logoutButton: {
    minHeight: 45,
    borderRadius: 10,
    backgroundColor: '#fff1f0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    gap: 10,
  },
  logoutPressed: {
    backgroundColor: '#ffe2df',
  },
  logoutIcon: {
    color: '#b42318',
    fontSize: 19,
    fontWeight: '800',
  },
  logoutText: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '700',
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#e6f4f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    color: '#0f766e',
    fontSize: 22,
    fontWeight: '800',
  },
  expensesChevron: {
    marginLeft: 'auto',
    color: '#64736e',
    fontSize: 18,
    fontWeight: '700',
  },
  expensesSubmenu: {
    marginLeft: 43,
    marginTop: -2,
    marginBottom: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#d5e9e3',
  },
  expensesSubmenuItem: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
  },
  expensesSubmenuIcon: {
    width: 18,
    color: '#0f766e',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  expensesSubmenuText: {
    color: '#43534d',
    fontSize: 13,
    fontWeight: '600',
  },
})
