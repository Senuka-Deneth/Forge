import { useMemo, useState } from 'react'
import AuthShell from '../components/AuthShell'
import GoogleIcon from '../components/GoogleIcon'
import { supabase } from '../supabaseClient'
import { getFriendlyAuthError, isValidEmail } from '../utils/authErrors'
import { ensureUserPreferences } from '../utils/userPreferences'

export default function SignUp() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const passwordScore = useMemo(() => {
    let score = 0
    if (password.length >= 8) score += 1
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
    if (/\d/.test(password)) score += 1
    if (/[^a-zA-Z0-9]/.test(password)) score += 1
    return score
  }, [password])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!supabase) {
      setError('Authentication is not configured for this app.')
      return
    }

    if (!name.trim()) {
      setError('Enter your full name.')
      return
    }

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      setLoading(false)
      setError(getFriendlyAuthError(signUpError))
      return
    }

    if (data.session?.user?.id) {
      try {
        await ensureUserPreferences(data.session.user.id)
      } catch (preferencesError) {
        console.warn('Unable to create preferences during sign up:', preferencesError)
      }
      window.history.replaceState(null, '', '/dashboard')
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }

    setLoading(false)
    setSuccess('Check your email for the verification link, then return here to sign in.')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setSuccess('')

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

  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  return (
    <AuthShell
      title="Create an account"
      subtitle="Join the platform to unlock trading insights."
      activeTab="signup"
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

        <div className="divider"><span className="divider-text">Or register via email</span></div>

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="signup-name">Full Name</label>
            <input
              className="field-input"
              type="text"
              id="signup-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="signup-email">Email Address</label>
            <input
              className="field-input"
              type="email"
              id="signup-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="signup-password">Password</label>
            <div className="field-wrap">
              <input
                className="field-input"
                type={showPassword ? 'text' : 'password'}
                id="signup-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
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
            <div className="pw-strength" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`pw-strength-bar ${index < passwordScore ? `score-${passwordScore}` : ''}`}
                />
              ))}
            </div>
            <div className="pw-strength-label">{strengthLabels[passwordScore]}</div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="signup-confirm-password">Confirm Password</label>
            <input
              className="field-input"
              type="password"
              id="signup-confirm-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error ? <div className="auth-message error" role="alert">{error}</div> : null}
          {success ? <div className="auth-message success" role="status">{success}</div> : null}

          <button type="submit" className={`btn-submit ${loading ? 'loading' : ''}`} disabled={loading || googleLoading}>
            {loading ? 'Creating account...' : 'Create Account'}
            <span className="spinner"></span>
          </button>
        </form>
      </div>
    </AuthShell>
  )
}
