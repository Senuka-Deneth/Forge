export default function AuthShell({ title, subtitle, activeTab, children }) {
  const goTo = (path) => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="login-layout">
      <div className="brand-side">
        <button type="button" className="brand-top brand-link" onClick={() => window.location.assign('/welcome.html')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M9 15l3-3 4 4 5-5" /></svg>
          Forge
        </button>

        <div className="brand-middle">
          <h2 className="brand-quote">
            47 indicators.<br /><i>One decision.</i>
          </h2>
          <div className="feature-list">
            <div className="feature-item">Real-time WebSocket market streams</div>
            <div className="feature-item">Dynamic support &amp; resistance tracking</div>
            <div className="feature-item">AI-verified directional bias</div>
            <div className="feature-item">Sub-second pivot level regeneration</div>
          </div>
        </div>

        <div className="brand-bottom">V.26.4 · SYSTEM: OPERATIONAL</div>
      </div>

      <div className="form-side">
        <div className="form-container">
          <div className="form-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${activeTab === 'signin' ? 'active' : ''}`}
              onClick={() => goTo('/signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`}
              onClick={() => goTo('/signup')}
            >
              Create Account
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
