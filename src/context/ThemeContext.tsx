import AsyncStorage from '@react-native-async-storage/async-storage'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'

export type ThemePreference = 'light' | 'dark' | 'system'

type ThemeContextType = {
  preference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  setPreference: (value: ThemePreference) => Promise<void>
}

const STORAGE_KEY = 'trackmo-theme'

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [preference, setPreferenceState] =
    useState<ThemePreference>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPreferenceState(saved)
      }
    })
  }, [])

  const setPreference = useCallback(async (value: ThemePreference) => {
    setPreferenceState(value)
    await AsyncStorage.setItem(STORAGE_KEY, value)
  }, [])

  const resolvedTheme =
    preference === 'system'
      ? systemScheme === 'dark' ? 'dark' : 'light'
      : preference

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useAppTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider')
  }

  return context
}
