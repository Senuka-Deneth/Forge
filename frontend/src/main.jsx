import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'
import { AuthProvider } from './context/AuthContext'
import AuthCallback from './pages/AuthCallback'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import './index.css'

const savedTheme = localStorage.getItem('forge_theme') || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)
document.body.setAttribute('data-theme', savedTheme)

function Router() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const handleRouteChange = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  if (path === '/signin') {
    return (
      <PublicOnlyRoute>
        <SignIn />
      </PublicOnlyRoute>
    )
  }

  if (path === '/signup') {
    return (
      <PublicOnlyRoute>
        <SignUp />
      </PublicOnlyRoute>
    )
  }

  if (path === '/auth/callback') {
    return <AuthCallback />
  }

  return (
    <ProtectedRoute>
      <App />
    </ProtectedRoute>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <Router />
  </AuthProvider>
)
