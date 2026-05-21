export function getFriendlyAuthError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  const code = String(error?.code || error?.name || '').toLowerCase()

  if (!message && !code) return 'Something went wrong. Please try again.'

  if (
    code.includes('invalid_credentials') ||
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials')
  ) {
    return 'Incorrect email or password.'
  }

  if (
    code.includes('email_not_confirmed') ||
    message.includes('email not confirmed') ||
    message.includes('email_not_confirmed')
  ) {
    return 'Please verify your email before signing in.'
  }

  if (
    code.includes('user_already_exists') ||
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('user already registered')
  ) {
    return 'An account with this email already exists.'
  }

  if (
    code.includes('weak_password') ||
    message.includes('weak password') ||
    message.includes('password should be')
  ) {
    return 'Password must be at least 8 characters.'
  }

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('load failed')
  ) {
    return 'Connection failed. Please try again.'
  }

  if (message.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  if (message.includes('provider is not enabled')) {
    return 'Google sign in is not configured yet.'
  }

  return 'Unable to complete that request. Please try again.'
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
