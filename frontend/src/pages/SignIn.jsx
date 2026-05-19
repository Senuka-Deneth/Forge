import { useState } from 'react'
import AuthShell from '../components/AuthShell'
import GoogleIcon from '../components/GoogleIcon'
import { supabase } from '../supabaseClient'
import { getFriendlyAuthError, isValidEmail } from '../utils/authErrors'

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const redirectToDashboard = () => {
    window.history.replaceState(null, '', '/dashboard')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!supabase) {
      setError('Authentication is not configured for this app.')
      return
    }

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    if (!password) {
      setError('Enter your password.')
      return
    }

    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)

    if (signInError) {
      setError(getFriendlyAuthError(signInError))
      return
    }

    redirectToDashboard()
  }

  const handleGoogleSignIn = async () => {
    setError('')

    if (!supabase) {
      setError('Authentication is not configured for this app.')
      return
    }

    setGoogleLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (oauthError) {
      setGoogleLoading(false)
      setError(getFriendlyAuthError(oauthError))
    }
  }

  const handlePasswordReset = async () => {
    setError('')
    setResetSent(false)

    if (!supabase) {
      setError('Authentication is not configured for this app.')
      return
    }

    if (!isValidEmail(email)) {
      setError('Enter your email first, then request a reset link.')
      return
    }

    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/signin`,
    })
    setLoading(false)

    if (resetError) {
      setError(getFriendlyAuthError(resetError))
      return
    }

    setResetSent(true)
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Enter your credentials to access the terminal."
      activeTab="signin"
    >
      <div className="auth-panel active">
        <button
          type="button"
          className={`btn-google ${googleLoading ? 'loading' : ''}`}
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
        </button>

        <div className="divider"><span className="divider-text">Or continue with email</span></div>

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="login-email">Email Address</label>
            <input
              className="field-input"
              type="email"
              id="login-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="login-password">Password</label>
            <div className="field-wrap">
              <input
                className="field-input"
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </button>
            </div>
          </div>

          <div className="options-row">
            <span className="checkbox-wrap">Session is securely remembered by Supabase</span>
            <button type="button" className="forgot-link reset-button" onClick={handlePasswordReset}>
              Forgot password?
            </button>
          </div>

          {error ? <div className="auth-message error" role="alert">{error}</div> : null}
          {resetSent ? <div className="auth-message success" role="status">If an account exists, a reset link has been sent.</div> : null}

          <button type="submit" className={`btn-submit ${loading ? 'loading' : ''}`} disabled={loading || googleLoading}>
            {loading ? 'Signing in...' : 'Sign In'}
            <span className="spinner"></span>
          </button>
        </form>
      </div>
    </AuthShell>
  )
}
