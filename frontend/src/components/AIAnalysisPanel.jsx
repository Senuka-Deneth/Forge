const COLOR_MAP = {
  bullish: '#26a69a', strong_bullish: '#00e676',
  bearish: '#ef5350', strong_bearish: '#d32f2f',
  neutral: '#90a4ae', sideways: '#ffd54f',
  long: '#26a69a', short: '#ef5350', wait: '#ffd54f',
  overbought: '#ef5350', oversold: '#26a69a',
  bullish_zone: '#66bb6a', bearish_zone: '#ef9a9a',
  high: '#ef5350', medium: '#ffd54f', low: '#26a69a',
  trending: '#29b6f6', ranging: '#ffd54f',
  breakout: '#ab47bc', reversal: '#ff7043',
  bullish_crossover: '#26a69a', bearish_crossover: '#ef5350',
  bullish_momentum: '#66bb6a', bearish_momentum: '#ef9a9a',
  above: '#26a69a', below: '#ef5350', at: '#90a4ae',
  mixed: '#ffd54f',
  accumulation: '#29b6f6', markup: '#26a69a',
  distribution: '#ffd54f', markdown: '#ef5350',
  consolidation: '#90a4ae',
  none: '#444'
}

function Tag({ value }) {
  if (!value) return <span className="ai-tag" style={{ backgroundColor: '#444' }}>—</span>
  const label = String(value).replace(/_/g, ' ')
  const bg = COLOR_MAP[value] ?? '#444'
  return <span className="ai-tag" style={{ backgroundColor: bg }}>{label}</span>
}

export default function AIAnalysisPanel({ analysis, loading, error, onRefresh }) {
  return (
    <div id="ai-analysis-section" className="ai-section">
      <div className="ai-header">
        <h2>🤖 AI Analysis</h2>
        <div className="ai-meta">
          <span id="ai-model-tag">gpt-oss:20b</span>
          <span
            className="ai-badge"
            style={{
              backgroundColor: loading ? '#ffd54f' : error ? '#ef5350' : '#26a69a'
            }}
          >
            {loading ? 'Analyzing...' : error ? 'Error' : analysis ? 'Ready' : 'Idle'}
          </span>
          <button id="ai-refresh-btn" onClick={onRefresh} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="ai-spinner" />
          <span>AI is analyzing market structure...</span>
        </div>
      )}

      {error && !loading && (
        <div className="ai-error">{error}</div>
      )}

      {analysis && !loading && (
        <div className="ai-grid">
          {/* ── Market Intelligence ── */}
          <div className="ai-card wide">
            <h3>Market Intelligence</h3>
            <div className="ai-summary-grid">
              <div className="ai-stat">
                <label>Primary Trend</label>
                <Tag value={analysis.summary?.primary_trend} />
              </div>
              <div className="ai-stat">
                <label>Momentum</label>
                <Tag value={analysis.summary?.momentum} />
              </div>
              <div className="ai-stat">
                <label>Phase</label>
                <Tag value={analysis.summary?.phase} />
              </div>
              <div className="ai-stat">
                <label>Regime</label>
                <Tag value={analysis.market_regime?.regime} />
              </div>
              <div className="ai-stat">
                <label>Bias</label>
                <Tag value={analysis.summary?.bias} />
              </div>
              <div className="ai-stat">
                <label>AI Confidence</label>
                <div className="confidence-bar-wrap">
                  <div
                    className="confidence-bar"
                    style={{
                      width: `${analysis.summary?.confidence ?? 0}%`,
                      backgroundColor:
                        (analysis.summary?.confidence ?? 0) >= 70 ? '#26a69a'
                        : (analysis.summary?.confidence ?? 0) >= 40 ? '#ffd54f'
                        : '#ef5350'
                    }}
                  />
                  <span>{analysis.summary?.confidence ?? 0}%</span>
                </div>
              </div>
            </div>
            {analysis.summary?.reasoning && (
              <p className="ai-reasoning">{analysis.summary.reasoning}</p>
            )}
          </div>

          {/* ── Indicator Readings ── */}
          <div className="ai-card">
            <h3>Indicator Readings</h3>
            <div className="indicator-row">
              <label>RSI</label>
              <Tag value={analysis.indicators?.rsi?.state} />
              <span className="small-text">{analysis.indicators?.rsi?.signal ?? ''}</span>
            </div>
            <div className="indicator-row">
              <label>RSI Divergence</label>
              <Tag value={analysis.indicators?.rsi?.divergence} />
            </div>
            <div className="indicator-row">
              <label>MACD</label>
              <Tag value={analysis.indicators?.macd?.state} />
            </div>
            <div className="indicator-row">
              <label>EMA Alignment</label>
              <Tag value={analysis.indicators?.ema?.alignment} />
            </div>
            <div className="indicator-row">
              <label>Price vs EMA20</label>
              <Tag value={analysis.indicators?.ema?.price_vs_ema20} />
            </div>
          </div>

          {/* ── Market Structure ── */}
          <div className="ai-card">
            <h3>Market Structure</h3>
            <div className="indicator-row">
              <label>Support</label>
              <span>{analysis.structure?.nearest_support ?? '—'}</span>
            </div>
            <div className="indicator-row">
              <label>Resistance</label>
              <span>{analysis.structure?.nearest_resistance ?? '—'}</span>
            </div>
            <div className="indicator-row">
              <label>Breakout Watch</label>
              <Tag value={analysis.structure?.breakout_watch} />
            </div>
            <div className="indicator-row">
              <label>Trend Strength</label>
              <span>{analysis.market_regime?.trend_strength ?? '—'} / 100</span>
            </div>
            <div className="indicator-row">
              <label>Volatility</label>
              <Tag value={analysis.market_regime?.volatility} />
            </div>
          </div>

          {/* ── Trade Logic ── */}
          <div className="ai-card wide">
            <h3>AI Trade Logic</h3>
            <div className="trade-logic-grid">
              <div className="scenario bull">
                <label>🟢 Bullish Scenario</label>
                <p>{analysis.trade_logic?.bullish_scenario ?? '—'}</p>
                <small>Invalidation: <strong>{analysis.trade_logic?.invalidation_bull ?? '—'}</strong></small>
              </div>
              <div className="scenario bear">
                <label>🔴 Bearish Scenario</label>
                <p>{analysis.trade_logic?.bearish_scenario ?? '—'}</p>
                <small>Invalidation: <strong>{analysis.trade_logic?.invalidation_bear ?? '—'}</strong></small>
              </div>
            </div>
            <div className="risk-note">
              <label>⚠️ Risk Note</label>
              <p>{analysis.trade_logic?.risk_note ?? '—'}</p>
            </div>
          </div>

          {/* ── Anomalies ── */}
          <div className="ai-card wide">
            <h3>Anomalies & Alerts</h3>
            <div>
              {analysis.anomalies?.length > 0
                ? analysis.anomalies.filter(a => a.type !== 'none').map((anom, i) => (
                    <div key={i} className="anomaly-item">
                      <span className="ai-tag" style={{ backgroundColor: COLOR_MAP[anom.severity] ?? '#444' }}>
                        {anom.type?.replace(/_/g, ' ')}
                      </span>
                      <span>{anom.description}</span>
                      <span className="severity">{anom.severity}</span>
                    </div>
                  ))
                : <span style={{ color: '#90a4ae', fontSize: '13px' }}>No anomalies detected.</span>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
