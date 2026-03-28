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
  error,
  pivotData
}) {
  const zoneColors = {
    above_R3: '#b71c1c',
    between_R2_R3: '#e53935', between_R1_R2: '#ef5350',
    between_PP_R1: '#ef9a9a',
    between_S1_PP: '#a5d6a7',
    between_S2_S1: '#26a69a', between_S3_S2: '#00897b',
    below_S3: '#004d40'
  }

  const pivots = pivotData?.classic?.pivots ?? null
  const pivotAnalysis = pivotData?.classic?.analysis ?? null

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

          {/* Pivot Points Info Panel */}
          {pivots && pivotAnalysis && (
            <div className="analysis-card pivot-panel">
              <h3>Pivot Points</h3>

              <div className="pivot-zone-badge">
                <label>Price Zone</label>
                <span
                  className="ai-tag"
                  style={{ backgroundColor: zoneColors[pivotAnalysis.zone] ?? '#444' }}
                >
                  {pivotAnalysis.zone.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="pivot-bias-row">
                <label>Session Bias</label>
                <span
                  className="ai-tag"
                  style={{
                    backgroundColor: pivotAnalysis.bias === 'bullish' ? '#26a69a' : '#ef5350'
                  }}
                >
                  {pivotAnalysis.bias}
                </span>
              </div>

              <div className="pivot-levels-grid">
                {[
                  { key: 'R3', cls: 'r3' },
                  { key: 'R2', cls: 'r2' },
                  { key: 'R1', cls: 'r1' },
                  { key: 'PP', cls: 'pp' },
                  { key: 'S1', cls: 's1' },
                  { key: 'S2', cls: 's2' },
                  { key: 'S3', cls: 's3' },
                ].map(({ key, cls }) => (
                  <div key={key} className={`plevel ${cls}`}>
                    <span>{key}</span>
                    <strong>{pivots[key]}</strong>
                  </div>
                ))}
              </div>

              {pivotAnalysis.atInflectionPoint && pivotAnalysis.inflectionLevel && (
                <div className="pivot-proximity">
                  ⚡ Price at inflection point:{' '}
                  <strong>
                    {pivotAnalysis.inflectionLevel.label} @ {pivotAnalysis.inflectionLevel.value}
                  </strong>
                </div>
              )}

              <div className="pivot-distance-row">
                <div>
                  <label>To Resistance</label>
                  <span>
                    {pivotAnalysis.distToResistance !== null
                      ? `${pivotAnalysis.distToResistance}% → ${pivotAnalysis.nearestResistance?.label}`
                      : '—'}
                  </span>
                </div>
                <div>
                  <label>To Support</label>
                  <span>
                    {pivotAnalysis.distToSupport !== null
                      ? `${pivotAnalysis.distToSupport}% → ${pivotAnalysis.nearestSupport?.label}`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

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