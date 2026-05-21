import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ensureUserPreferences } from '../utils/userPreferences'

export const AuthContext = createContext(null)

const AUTH_ROUTES = new Set(['/signin', '/signup', '/auth/callback'])

function getPath() {
  return window.location.pathname
}

function replacePath(path) {
  if (getPath() !== path) {
    window.history.replaceState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function isProtectedPath(path) {
  return path === '/' || path === '/dashboard'
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const syncSession = useCallback(async (nextSession) => {
    setSession(nextSession)
    setUser(nextSession?.user ?? null)

    if (nextSession?.user?.id) {
      try {
        await ensureUserPreferences(nextSession.user.id)
      } catch (error) {
        console.warn('Unable to ensure user preferences:', error)
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      if (!supabase) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        console.warn('Unable to load auth session:', error)
        setSession(null)
        setUser(null)
      } else {
        await syncSession(data.session)
      }

      setLoading(false)
    }

    loadSession()

    if (!supabase) {
      return () => {
        mounted = false
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      await syncSession(nextSession)

      const path = getPath()
      if (event === 'SIGNED_OUT' && isProtectedPath(path)) {
        replacePath('/signin')
      }
      if (nextSession?.user && AUTH_ROUTES.has(path)) {
        replacePath('/dashboard')
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [syncSession])

  const signOut = useCallback(async () => {
    if (!supabase) {
      replacePath('/signin')
      return { error: null }
    }

    const { error } = await supabase.auth.signOut()
    if (!error) replacePath('/signin')
    return { error }
  }, [])

  const value = useMemo(() => ({
    user,
    session,
    loading,
    signOut,
  }), [user, session, loading, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
