function formatValue(value, digits = 2) {
  if (value == null) return '--'
  return Number(value).toFixed(digits)
}

function formatLevel(item) {
  if (!item) return '--'
  return `${Number(item.price).toFixed(2)}`
}

export default function AnalysisPanel({
  symbol,
  interval,
  analysis,
  loading,
  error
}) {
  return (
    <div className="analysis-panel">
      <div className="panel-header">
        <h2>Analysis</h2>
        <span className="panel-badge">
          {loading ? 'Running' : analysis ? 'Ready' : 'Waiting'}
        </span>
      </div>

      {error && (
        <div className="analysis-card error-card">
          <h3>Analysis Error</h3>
          <p>{error}</p>
        </div>
      )}

      {!analysis && !loading && !error && (
        <div className="analysis-card">
          <h3>No Analysis Yet</h3>
          <p>
            Load a market and run analysis for <strong>{symbol}</strong> on <strong>{interval}</strong>.
          </p>
        </div>
      )}

      {loading && (
        <div className="analysis-card">
          <h3>Analyzing Market</h3>
          <p>Building trend, momentum, and support/resistance summary...</p>
        </div>
      )}

      {analysis && (
        <>
          <div className="analysis-card">
            <h3>Market Summary</h3>
            <div className="kv-grid">
              <div className="kv-item">
                <span className="kv-label">Trend</span>
                <span className="kv-value">{analysis.trend}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Momentum</span>
                <span className="kv-value">{analysis.momentum}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">RSI State</span>
                <span className="kv-value">{analysis.rsiState}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">MACD State</span>
                <span className="kv-value">{analysis.macdState}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Confidence</span>
                <span className="kv-value">{analysis.confidence}%</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Latest Price</span>
                <span className="kv-value">{formatValue(analysis.latestPrice)}</span>
              </div>
            </div>
          </div>

          <div className="analysis-card">
            <h3>Key Levels</h3>
            <div className="kv-grid">
              <div className="kv-item">
                <span className="kv-label">EMA 20</span>
                <span className="kv-value">{formatValue(analysis.ema20)}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">EMA 50</span>
                <span className="kv-value">{formatValue(analysis.ema50)}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Nearest Support</span>
                <span className="kv-value">{formatLevel(analysis.nearestSupport)}</span>
              </div>
              <div className="kv-item">
                <span className="kv-label">Nearest Resistance</span>
                <span className="kv-value">{formatLevel(analysis.nearestResistance)}</span>
              </div>
            </div>
          </div>

          <div className="analysis-card">
            <h3>Trade Logic</h3>
            <ul className="analysis-list">
              <li><strong>Bullish:</strong> {analysis.bullishScenario}</li>
              <li><strong>Bearish:</strong> {analysis.bearishScenario}</li>
              <li><strong>Invalidation:</strong> {analysis.invalidation}</li>
            </ul>
          </div>

          <div className="analysis-card">
            <h3>Recent Swing Points</h3>
            <div className="swing-columns">
              <div>
                <div className="swing-title">Swing Highs</div>
                <ul className="analysis-list tight">
                  {analysis.swingHighs?.length
                    ? analysis.swingHighs.map((item, idx) => (
                        <li key={`high-${idx}`}>{Number(item.price).toFixed(2)}</li>
                      ))
                    : <li>None</li>}
                </ul>
              </div>

              <div>
                <div className="swing-title">Swing Lows</div>
                <ul className="analysis-list tight">
                  {analysis.swingLows?.length
                    ? analysis.swingLows.map((item, idx) => (
                        <li key={`low-${idx}`}>{Number(item.price).toFixed(2)}</li>
                      ))
                    : <li>None</li>}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}