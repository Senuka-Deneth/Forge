function formatValue(value, digits = 2) {
  if (value == null) return '—'
  return Number(value).toFixed(digits)
}

function formatLevel(item) {
  if (!item) return '—'
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

  const statusText = loading ? 'Running' : error ? 'Error' : analysis ? 'Ready' : 'Waiting'
  const confidenceValue = analysis?.confidence ?? 0

  return (
    <>
      <div className="panel-card glass-card">
        <div className="panel-card-header">
          <span className="panel-title">Market Summary</span>
          <span className={`panel-badge ${statusText === 'Ready' ? 'ready' : ''}`} id="analysis-status-badge">
            {statusText}
          </span>
        </div>
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-label">Trend</div>
            <div className="summary-value" id="summary-trend">{analysis?.trend || '—'}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">Momentum</div>
            <div className="summary-value" id="summary-momentum">{analysis?.momentum || '—'}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">RSI State</div>
            <div className="summary-value" id="summary-rsi-state">{analysis?.rsiState || '—'}</div>
          </div>
          <div className="summary-item">
            <div className="summary-label">MACD State</div>
            <div className="summary-value" id="summary-macd-state">{analysis?.macdState || '—'}</div>
          </div>
        </div>
        <div className="confidence-row">
          <span className="summary-label">Confidence</span>
          <div className="confidence-bar-track">
            <div className="confidence-bar-fill" id="confidence-bar-fill" style={{
              width: `${confidenceValue}%`,
              backgroundColor: confidenceValue >= 70 ? 'var(--bull)' : confidenceValue >= 40 ? 'var(--neutral)' : 'var(--bear)'
            }}></div>
          </div>
          <span className="confidence-pct" id="confidence-pct">{analysis ? `${confidenceValue}%` : '—'}</span>
        </div>
      </div>

      <div className="panel-card glass-card">
        <div className="panel-card-header">
          <span className="panel-title">Key Levels</span>
        </div>
        <div className="levels-grid">
          <div className="level-item">
            <span className="level-label">EMA 20</span>
            <span className="level-value" id="level-ema20">{formatValue(analysis?.ema20)}</span>
          </div>
          <div className="level-item">
            <span className="level-label">EMA 50</span>
            <span className="level-value" id="level-ema50">{formatValue(analysis?.ema50)}</span>
          </div>
          <div className="level-item">
            <span className="level-label">Support</span>
            <span className="level-value bull" id="level-support">{formatLevel(analysis?.nearestSupport)}</span>
          </div>
          <div className="level-item">
            <span className="level-label">Resistance</span>
            <span className="level-value bear" id="level-resistance">{formatLevel(analysis?.nearestResistance)}</span>
          </div>
        </div>
      </div>

      <div className="panel-card glass-card" id="pivot-info-panel">
        <div className="panel-card-header">
          <span className="panel-title">Pivot Points</span>
        </div>

        <div className="pivot-meta-row">
          <div className="pivot-meta-item">
            <span className="summary-label">Price Zone</span>
            <span id="pivot-zone-tag" className="status-pill" style={{
              backgroundColor: pivotAnalysis?.zone ? zoneColors[pivotAnalysis.zone] : 'transparent',
              color: pivotAnalysis?.zone ? '#fff' : 'inherit',
              border: pivotAnalysis?.zone ? 'none' : '1px solid var(--border-default)'
            }}>
              {pivotAnalysis ? pivotAnalysis.zone.replace(/_/g, ' ') : '—'}
            </span>
          </div>
          <div className="pivot-meta-item">
            <span className="summary-label">Session Bias</span>
            <span id="pivot-bias-tag" className="status-pill" style={{
               backgroundColor: pivotAnalysis?.bias === 'bullish' ? 'var(--bull)' : pivotAnalysis?.bias === 'bearish' ? 'var(--bear)' : 'transparent',
               color: pivotAnalysis?.bias ? '#fff' : 'inherit',
               border: pivotAnalysis?.bias ? 'none' : '1px solid var(--border-default)'
            }}>
              {pivotAnalysis?.bias || '—'}
            </span>
          </div>
        </div>

        <div className="pivot-levels-stack">
          <div className="plevel r3">
            <span>R3</span><strong id="pv-R3">{pivots?.R3 ?? '—'}</strong>
          </div>
          <div className="plevel r2">
            <span>R2</span><strong id="pv-R2">{pivots?.R2 ?? '—'}</strong>
          </div>
          <div className="plevel r1">
            <span>R1</span><strong id="pv-R1">{pivots?.R1 ?? '—'}</strong>
          </div>
          <div className="plevel pp">
            <span>PP</span><strong id="pv-PP">{pivots?.PP ?? '—'}</strong>
          </div>
          <div className="plevel s1">
            <span>S1</span><strong id="pv-S1">{pivots?.S1 ?? '—'}</strong>
          </div>
          <div className="plevel s2">
            <span>S2</span><strong id="pv-S2">{pivots?.S2 ?? '—'}</strong>
          </div>
          <div className="plevel s3">
            <span>S3</span><strong id="pv-S3">{pivots?.S3 ?? '—'}</strong>
          </div>
        </div>

        {pivotAnalysis?.atInflectionPoint && pivotAnalysis?.inflectionLevel && (
          <div id="pivot-inflection" className="inflection-alert" style={{ display: 'flex' }}>
            <span>⚡</span>
            <span>Inflection: <strong id="pivot-inflection-level">{pivotAnalysis.inflectionLevel.label} @ {pivotAnalysis.inflectionLevel.value}</strong></span>
          </div>
        )}
        {(!pivotAnalysis?.atInflectionPoint || !pivotAnalysis?.inflectionLevel) && (
          <div id="pivot-inflection" className="inflection-alert" style={{ display: 'none' }}>
            <span>⚡</span>
            <span>Inflection: <strong id="pivot-inflection-level"></strong></span>
          </div>
        )}

        <div className="pivot-distance-row">
          <div className="pivot-dist-item">
            <span className="summary-label">To Resistance</span>
            <span id="pivot-dist-res" className="bear">
              {pivotAnalysis?.distToResistance !== null && pivotAnalysis?.distToResistance !== undefined
                ? `${pivotAnalysis.distToResistance}% → ${pivotAnalysis.nearestResistance?.label}`
                : '—'}
            </span>
          </div>
          <div className="pivot-dist-item">
            <span className="summary-label">To Support</span>
            <span id="pivot-dist-sup" className="bull">
              {pivotAnalysis?.distToSupport !== null && pivotAnalysis?.distToSupport !== undefined
                ? `${pivotAnalysis.distToSupport}% → ${pivotAnalysis.nearestSupport?.label}`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="panel-card glass-card wide tall-dashboard-panel">
        <div className="panel-card-header">
          <span className="panel-title">Trade Logic</span>
        </div>
        <div className="trade-scenarios">
          <div className="scenario bull-scenario">
            <div className="scenario-header">Bullish</div>
            <p id="trade-bull">{analysis?.bullishScenario || '—'}</p>
          </div>
          <div className="scenario bear-scenario">
            <div className="scenario-header">Bearish</div>
            <p id="trade-bear">{analysis?.bearishScenario || '—'}</p>
          </div>
        </div>
        <div className="invalidation-row">
          <div className="inv-item">
            <span className="summary-label">Bull invalidation</span>
            <span id="inv-bull" className="bear">{analysis?.invalidation || '—'}</span>
          </div>
          <div className="inv-item">
            <span className="summary-label">Bear invalidation</span>
            <span id="inv-bear" className="bull">{analysis?.invalidation || '—'}</span>
          </div>
        </div>
      </div>

      <div className="panel-card glass-card tall-dashboard-panel">
        <div className="panel-card-header">
          <span className="panel-title">Recent Swing Points</span>
        </div>
        <div className="swing-grid">
          <div className="swing-col">
            <div className="swing-col-header bear">Swing Highs</div>
            <div id="swing-highs-list" className="swing-list">
              {analysis?.swingHighs?.length ? analysis.swingHighs.map((item, idx) => (
                <div key={`high-${idx}`} className="swing-item">{Number(item.price).toFixed(2)}</div>
              )) : <div className="swing-item">—</div>}
            </div>
          </div>
          <div className="swing-col">
            <div className="swing-col-header bull">Swing Lows</div>
            <div id="swing-lows-list" className="swing-list">
              {analysis?.swingLows?.length ? analysis.swingLows.map((item, idx) => (
                <div key={`low-${idx}`} className="swing-item">{Number(item.price).toFixed(2)}</div>
              )) : <div className="swing-item">—</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}