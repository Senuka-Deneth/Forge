export default function AuthShell({ title, subtitle, activeTab, children }) {
  const goTo = (path) => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="login-layout">
      <div className="brand-side">
        <div className="brand-content">
          <button type="button" className="brand-top brand-link" onClick={() => window.location.assign('/welcome.html')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M9 15l3-3 4 4 5-5" /></svg>
            Forge
          </button>

          <div className="brand-middle">
            <svg className="brand-ridge" viewBox="0 0 480 80" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 64 L40 58 L80 66 L120 44 L160 52 L200 30 L240 40 L280 18 L320 30 L360 12 L400 22 L440 8 L480 16 L480 80 L0 80 Z" fill="var(--accent-subtle)" stroke="none" />
              <path d="M0 64 L40 58 L80 66 L120 44 L160 52 L200 30 L240 40 L280 18 L320 30 L360 12 L400 22 L440 8 L480 16" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
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
