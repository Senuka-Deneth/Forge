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

      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setMessage(getFriendlyAuthError(error))
          window.setTimeout(() => {
            window.history.replaceState(null, '', '/signin')
            window.dispatchEvent(new PopStateEvent('popstate'))
          }, 1600)
          return
        }
      }

      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.user) {
        setMessage(getFriendlyAuthError(error || 'Session was not created.'))
        window.setTimeout(() => {
          window.history.replaceState(null, '', '/signin')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }, 1600)
        return
      }

      try {
        await ensureUserPreferences(data.session.user.id)
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
