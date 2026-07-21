export default function HeaderControls({
  isLive,
  preferencesWarning,
}) {
  return (
    <div className="topbar-stack">
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand-title">
            Market overview
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