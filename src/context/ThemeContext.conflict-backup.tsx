
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

export type ThemePreference = 'light' | 'dark'

type ThemeContextType = {
  preference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  setPreference: (value: ThemePreference) => Promise<void>
}

const STORAGE_KEY = 'trackmo-theme'

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
<<<<<<< Updated upstream
  const [preference, setPreferenceState] =
    useState<ThemePreference>('light')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setPreferenceState(saved)
=======
  const systemScheme = useColorScheme()

  // Start with a consistent light theme for server and initial browser render.
  const [preference, setPreferenceState] =
    useState<ThemePreference>('light')

  const [isThemeLoaded, setIsThemeLoaded] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY)

        if (
          mounted &&
          (saved === 'light' || saved === 'dark' || saved === 'system')
        ) {
          setPreferenceState(saved)
        }
      } catch (error) {
        console.error('Unable to load saved theme:', error)
      } finally {
        if (mounted) {
          setIsThemeLoaded(true)
        }
>>>>>>> Stashed changes
      }
    }

    void loadTheme()

    return () => {
      mounted = false
    }
  }, [])

  const setPreference = useCallback(async (value: ThemePreference) => {
    setPreferenceState(value)

    try {
      await AsyncStorage.setItem(STORAGE_KEY, value)
    } catch (error) {
      console.error('Unable to save theme:', error)
      throw error
    }
  }, [])

<<<<<<< Updated upstream
  const resolvedTheme = preference
=======
  const resolvedTheme =
    preference === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference
>>>>>>> Stashed changes

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  )

  // Keep the initial theme consistent until saved preferences are loaded.
  if (!isThemeLoaded) {
    return (
      <ThemeContext.Provider
        value={{
          preference: 'light',
          resolvedTheme: 'light',
          setPreference,
        }}
      >
        {children}
      </ThemeContext.Provider>
    )
  }

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

