export default function HeaderControls({
  symbolInput,
  setSymbolInput,
  interval,
  setInterval,
  onLoad,
  isLive,
  toggleTheme,
  theme
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <label className="label-caps" style={{marginRight:'12px', color:'var(--text-muted)'}}>Pair</label>
        <div className="symbol-selector-wrap">
          <input
            id="symbol-input"
            className="symbol-input"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="BTCUSDT"
          />
          <select
            id="timeframe-select"
            className="timeframe-select"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            <option value="15m">15m</option>
            <option value="1h">1H</option>
            <option value="4h">4H</option>
            <option value="1d">1D</option>
            <option value="1w">1W</option>
          </select>
          <button id="load-chart-btn" className="btn-primary" onClick={onLoad}>
            Load
          </button>
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
  )
}