import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getFriendlyAuthError } from '../utils/authErrors'
import { ensureUserPreferences } from '../utils/userPreferences'

export default function AuthCallback() {
  const [message, setMessage] = useState('Completing sign in...')

  useEffect(() => {
    async function finishAuth() {
      if (!supabase) {
        setMessage('Authentication is not configured for this app.')
        window.setTimeout(() => {
          window.history.replaceState(null, '', '/signin')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, 1200)
        return
      }

      const params = new URLSearchParams(window.location.search)
      const errorDescription = params.get('error_description') || params.get('error')

      if (errorDescription) {
        setMessage(getFriendlyAuthError(errorDescription))
        window.setTimeout(() => {
          window.history.replaceState(null, '', '/signin')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, 1600)
        return
      }

      // The Supabase client is created with detectSessionInUrl: true (see supabaseClient.js),
      // so it already exchanges the ?code= param for a session automatically. A PKCE code is
      // single-use, so calling exchangeCodeForSession here too would race that exchange and
      // error on whichever call runs second. Instead, wait for the session it produces.
      const session = await new Promise((resolve) => {
        let settled = false
        const finish = (result) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          subscription?.unsubscribe()
          resolve(result)
        }

        const { data: subscriptionData } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (newSession?.user) finish(newSession)
        })
        const subscription = subscriptionData?.subscription

        supabase.auth.getSession().then(({ data }) => {
          if (data.session?.user) finish(data.session)
        })

        const timeoutId = window.setTimeout(() => finish(null), 6000)
      })

      if (!session?.user) {
        setMessage(getFriendlyAuthError('Session was not created.'))
        window.setTimeout(() => {
          window.history.replaceState(null, '', '/signin')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, 1600)
        return
      }

      try {
        await ensureUserPreferences(session.user.id)
      } catch (preferencesError) {
        console.warn('Unable to ensure preferences after auth callback:', preferencesError)
      }

      window.history.replaceState(null, '', '/dashboard')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    finishAuth()
  }, [])

  return (
    <div className="auth-route-loader" role="status" aria-live="polite">
      <span className="spinner visible"></span>
      {message}
    </div>
  )
}
