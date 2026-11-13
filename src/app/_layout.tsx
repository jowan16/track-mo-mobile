
import { DarkTheme, DefaultTheme, ThemeProvider as RouterThemeProvider, Stack } from 'expo-router'

import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext'


function AppContent() {
  const { resolvedTheme } = useAppTheme()

  return (
    <RouterThemeProvider
      value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(user)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </RouterThemeProvider>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  )
}
