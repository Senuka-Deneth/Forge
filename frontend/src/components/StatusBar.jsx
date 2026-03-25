function formatPrice(value) {
  if (value == null) return '--'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })
}

function formatVolume(value) {
  if (value == null) return '--'
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })
}

export default function StatusBar({
  symbol,
  interval,
  latestPrice,
  priceChange,
  latestCandle,
  status,
  loading,
  error
}) {
  const positive = priceChange != null && priceChange >= 0

  return (
    <section className="statusbar">
      <div className="status-left">
        <div className="info-chip">
          <span className="info-label">Symbol</span>
          <span className="info-value">{symbol}</span>
        </div>

        <div className="info-chip">
          <span className="info-label">Timeframe</span>
          <span className="info-value">{interval}</span>
        </div>

        <div className="info-chip price-chip">
          <span className="info-label">Last Price</span>
          <span className="info-value">{formatPrice(latestPrice)}</span>
        </div>

        <div className={`info-chip ${positive ? 'positive-chip' : 'negative-chip'}`}>
          <span className="info-label">Change</span>
          <span className="info-value">
            {priceChange == null ? '--' : `${positive ? '+' : ''}${priceChange.toFixed(2)}%`}
          </span>
        </div>

        <div className="info-chip">
          <span className="info-label">Volume</span>
          <span className="info-value">{formatVolume(latestCandle?.volume)}</span>
        </div>

        <div className="info-chip">
          <span className="info-label">RSI 14</span>
          <span className="info-value">
            {latestCandle?.rsi14 == null ? '--' : latestCandle.rsi14.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="status-right">
        <div className={`status-badge ${loading ? 'status-loading' : error ? 'status-bad' : 'status-good'}`}>
          {loading ? 'Loading' : error ? 'Error' : 'Ready'}
        </div>
        <div className="status-text">{status}</div>
        {error && <div className="status-error">{error}</div>}
      </div>
    </section>
  )
}