import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && user) {
      window.history.replaceState(null, '', '/dashboard')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [loading, user])

  if (loading) {
    return (
      <div className="auth-route-loader" role="status" aria-live="polite">
        <span className="spinner visible"></span>
        Loading your session...
      </div>
    )
  }

  if (user) return null

  return children
}
