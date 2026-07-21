export default function HeaderControls({
  isLive,
  preferencesWarning,
}) {
  return (
    <div className="topbar-stack">
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand-title" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em', fontFamily: 'var(--font-ui), sans-serif' }}>
            MARKET OVERVIEW
          </div>
        </div>

        <div className="topbar-right">
          {isLive && (
            <div className="live-indicator" id="live-indicator">
              <span className="live-dot"></span>
              <span>Live</span>
            </div>
          )}
        </div>
      </header>
      {preferencesWarning ? (
        <div className="prefs-sync-banner" role="status">
          <strong>Chart settings sync:</strong>
          {' '}
          {preferencesWarning}
        </div>
      ) : null}
    </div>
  )
}