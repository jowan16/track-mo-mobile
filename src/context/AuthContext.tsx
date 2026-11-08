
import type { Session } from '@supabase/supabase-js'
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react'

import { supabase } from '@/services/supabase'
import type { Profile } from '@/types/profile'

interface AuthContextType {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Profile>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<Profile | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const userId = session?.user.id

  const fetchProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error

    return data as Profile | null
  }, [])

  const validateProfile = useCallback(async (id: string) => {
    const result = await fetchProfile(id)

    if (!result) {
      throw new Error(
        'Unable to verify your account. Please contact the administrator.',
      )
    }

    if (result.status !== 'active') {
      throw new Error(
        'Your account has been suspended. Please contact the administrator.',
      )
    }

    const role = result.role?.toLowerCase()

    if (role !== 'admin' && role !== 'user') {
      throw new Error(
        'Your account has an invalid role. Please contact the administrator.',
      )
    }

    return result
  }, [fetchProfile])

  // Initialize and monitor the Supabase session.
  useEffect(() => {
    let mounted = true
    let authEventVersion = 0

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authEventVersion += 1

      if (!mounted) return

      setSession(newSession)

      if (!newSession) {
        setProfile(null)
        setLoading(false)
      }
    })

    const initializeSession = async () => {
      const versionAtStart = authEventVersion

      try {
        const { data, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) throw error

        if (versionAtStart === authEventVersion) {
          setSession(data.session)

          if (!data.session) {
            setProfile(null)
            setLoading(false)
          }
        }
      } catch (error) {
        console.error('Unable to initialize session:', error)

        if (mounted) setLoading(false)
      }
    }

    void initializeSession()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Load and validate the profile when the user changes.
  useEffect(() => {
    let mounted = true

    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setProfile(null)

    const loadProfile = async () => {
      try {
        const result = await validateProfile(userId)

        if (mounted) setProfile(result)
      } catch (error) {
        console.error('Unable to load user profile:', error)

        if (mounted) {
          setProfile(null)
          await supabase.auth.signOut()
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadProfile()

    return () => {
      mounted = false
    }
  }, [userId, validateProfile])

  // Sign in and verify the account before allowing access.
  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<Profile> => {
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) throw error

      try {
        const result = await validateProfile(data.user.id)
        setProfile(result)
        return result
      } catch (profileError) {
        await supabase.auth.signOut()
        throw profileError
      }
    } finally {
      setLoading(false)
    }
  }, [validateProfile])

  // Refresh the current user's profile.
  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!userId) return null

    try {
      const result = await validateProfile(userId)
      setProfile(result)
      return result
    } catch (error) {
      console.error('Unable to refresh profile:', error)
      setProfile(null)
      await supabase.auth.signOut()
      return null
    }
  }, [userId, validateProfile])

  // Sign out the current user.
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) throw error

    setProfile(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
