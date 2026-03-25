export default function HeaderControls({
  symbolInput,
  setSymbolInput,
  interval,
  setInterval,
  onLoad,
  loading,
  isLive
}) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-title">Vision Chart Bot</div>
        <div className="brand-subtitle">Binance Spot · Lightweight Charts</div>
      </div>

      <div className="topbar-controls">
        <input
          className="control-input"
          type="text"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
          placeholder="BTCUSDT"
        />

        <select
          className="control-select"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
        >
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="4h">4h</option>
          <option value="1d">1d</option>
        </select>

        <button className="load-button" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load Chart'}
        </button>

        <div className={`live-pill ${isLive ? 'live-on' : 'live-off'}`}>
          <span className="live-dot" />
          {isLive ? 'Live' : 'Offline'}
        </div>
      </div>
    </header>
  )
}