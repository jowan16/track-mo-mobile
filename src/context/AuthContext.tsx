
import type { Session } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    useRef,
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
  const signingInRef = useRef(false)
  const heartbeatInFlightRef = useRef(false)

  const userId = session?.user.id

  const fetchProfile = useCallback(async (id: string) => {
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      return { data, error }
    }

    // Refresh proactively if the saved access token is expired or about to
    // expire, rather than sending a known-stale JWT to PostgREST.
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession()

    if (sessionError) throw sessionError

    if (
      sessionData.session?.expires_at &&
      sessionData.session.expires_at <= Math.floor(Date.now() / 1000) + 60
    ) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError
    }

    let result = await load()

    // A request can still race with token expiry. Refresh once and retry only
    // for an expired-JWT response; do not hide unrelated database errors.
    if (
      result.error &&
      (result.error.code === 'PGRST303' ||
        /jwt expired|token expired/i.test(result.error.message))
    ) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) throw refreshError
      result = await load()
    }

    if (result.error) throw result.error

    return result.data as Profile | null
  }, [])

  const validateProfile = useCallback(async (id: string) => {
    const result = await fetchProfile(id)

    if (!result) {
      throw new Error(
        'Unable to verify your account. Please contact the administrator.',
      )
    }

    const status = result.status?.toLowerCase()

    if (status === 'suspended') {
      throw new Error(
        'Your account has been suspended. Please contact the administrator for assistance.',
      )
    }

    if (status !== 'active') {
      throw new Error(
        'Unable to verify your account status. Please contact the administrator.',
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

    if (signingInRef.current) return

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
        const message = error instanceof Error ? error.message : ''
        const isSuspension = message.toLowerCase().includes('suspended')

        // A suspension is an expected access-control result, not an app error.
        if (!isSuspension) {
          console.error('Unable to load user profile:', error)
        }

        if (mounted) {
          setProfile(null)
          await supabase.auth.signOut({ scope: 'local' })
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

  // Immediately end the local session if an administrator suspends this
  // account while the user is already signed in.
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`profile-status-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const updatedProfile = payload.new as Profile
          if (updatedProfile.status?.toLowerCase() !== 'active') {
            setProfile(null)
            void supabase.auth.signOut({ scope: 'local' })
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  // Record a server-timestamped heartbeat while the app is in the foreground.
  // Admin screens consider a user online for 90 seconds after this heartbeat.
  useEffect(() => {
    if (!userId || profile?.status !== 'active') return

    let mounted = true
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null

    const sendHeartbeat = async () => {
      if (!mounted || heartbeatInFlightRef.current) return
      heartbeatInFlightRef.current = true

      try {
        const { error } = await supabase.rpc('touch_last_active')
        if (error && mounted) {
          console.warn('Unable to update last active timestamp:', error.message)
        }
      } catch (error) {
        if (mounted) console.warn('Unable to send activity heartbeat:', error)
      } finally {
        heartbeatInFlightRef.current = false
      }
    }

    const startHeartbeat = () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval)
      void sendHeartbeat()
      heartbeatInterval = setInterval(() => {
        void sendHeartbeat()
      }, 30_000)
    }

    const stopHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }
    }

    if (AppState.currentState === 'active') startHeartbeat()

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        startHeartbeat()
      } else {
        stopHeartbeat()
      }
    })

    return () => {
      mounted = false
      stopHeartbeat()
      appStateSubscription.remove()
    }
  }, [userId, profile?.status])

  // Sign in and verify the account before allowing access.
  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<Profile> => {
    signingInRef.current = true
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) throw error

      // Do not allow an account without a confirmed email to proceed,
      // even if email confirmation was accidentally disabled in project settings.
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut({ scope: 'local' })
        throw new Error('Please verify your email address before logging in. Check your inbox for the verification link.')
      }

      try {
        const result = await validateProfile(data.user.id)
        setProfile(result)
        return result
      } catch (profileError) {
        await supabase.auth.signOut({ scope: 'local' })
        throw profileError
      }
    } finally {
      signingInRef.current = false
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
      const message = error instanceof Error ? error.message : ''
      if (!message.toLowerCase().includes('suspended')) {
        console.error('Unable to refresh profile:', error)
      }
      setProfile(null)
      await supabase.auth.signOut({ scope: 'local' })
      return null
    }
  }, [userId, validateProfile])

  // Sign out the current user.
  const signOut = useCallback(async () => {
    // The app uses Supabase's default global sign-out scope, so end all of this
    // user's presence sessions before revoking the authenticated sessions.
    const { error: presenceError } = await supabase.rpc('end_last_active_session')
    if (presenceError) {
      console.warn('Unable to record session logout:', presenceError.message)
    }

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
