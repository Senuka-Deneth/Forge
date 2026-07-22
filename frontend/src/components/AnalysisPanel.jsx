function formatValue(value, digits = 2) {
  if (value == null) return '—'
  return Number(value).toFixed(digits)
}

function formatLevel(item) {
  if (!item) return '—'
  return `${Number(item.price).toFixed(2)}`
}

import { signalAgreementLabel } from '../utils/signalAgreement'

function formatSwingTime(epochSeconds) {
  if (!Number.isFinite(Number(epochSeconds))) return '—'
  const d = new Date(Number(epochSeconds) * 1000)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', timeZone: 'UTC' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`
}

// Maps the 8-way pivot zone to the 4 Constructivist zone-block buckets
// (top = premium/expensive, bottom = discount/cheap, middle = equilibrium)
function zoneBucket(zone) {
  if (!zone) return null
  if (zone === 'above_R3' || zone === 'between_R2_R3' || zone === 'between_R1_R2') return 'premium'
  if (zone === 'between_S2_S1' || zone === 'between_S3_S2' || zone === 'below_S3') return 'discount'
  return 'equilibrium'
}

export default function AnalysisPanel({
  symbol,
  interval,
  analysis,
  loading = false,
  error = '',
  pivotData,
  signalAgreement = null,
  empiricalConfidence = null,
  empiricalSampleSize = null
}) {
  const pivots = pivotData?.classic?.pivots ?? null
  const pivotAnalysis = pivotData?.classic?.analysis ?? null

  const statusText = loading ? 'Running' : error ? 'Error' : analysis ? 'Ready' : 'Waiting'
  const agreementScore = signalAgreement?.score ?? null

  return (
    <>
      <div className="panel-card">
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
        <div
          className="confidence-row"
          title="How many independent checks (EMA stack, RSI, MACD, pivot bias, S/R zones, divergence, inflection) point the same way. This is an alignment count, not a probability."
        >
          <span className="summary-label">Signal agreement</span>
          <div className="confidence-bar-track">
            <div
              className={`confidence-bar-fill ${(agreementScore ?? 0) >= 70 ? 'confidence-bar-fill--bull' : (agreementScore ?? 0) >= 45 ? '' : 'confidence-bar-fill--bear'}`}
              id="confidence-bar-fill"
              style={{ width: `${agreementScore ?? 0}%` }}
            ></div>
          </div>
          <span className="confidence-pct" id="confidence-pct">
            {agreementScore != null ? `${agreementScore}/100` : '—'}
          </span>
        </div>
        <p className="ai-signal-note mt-2">
          {signalAgreementLabel(agreementScore)} — an alignment count, not a probability.
          {signalAgreement && !signalAgreement.pivotsIncluded && ' Pivot checks excluded until pivots load.'}
        </p>
        {empiricalConfidence != null && (
          <div className="row-between mt-1">
            <span title="Realized hit rate for this setup type from scored past predictions. This is the only calibrated number on this card.">
              Calibrated hit rate
            </span>
            <span className={(empiricalSampleSize ?? 0) < 20 ? 'low-confidence' : ''}>
              {empiricalConfidence}%
              {empiricalSampleSize != null ? ` (n=${empiricalSampleSize})` : ''}
              {(empiricalSampleSize ?? 0) < 20 ? ' — too few samples to trust' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="panel-card" id="key-levels-panel">
        <div className="panel-card-header">
          <span className="panel-title">Key Levels</span>
        </div>
        <div className="levels-grid">
          <div className="level-item">
            <div className="level-item__meta">
              <span className="level-label">EMA 20</span>
              <span className="level-item__hint">Short-term MA</span>
            </div>
            <span className="level-value" id="level-ema20">{formatValue(analysis?.ema20)}</span>
          </div>
          <div className="level-item">
            <div className="level-item__meta">
              <span className="level-label">EMA 50</span>
              <span className="level-item__hint">Medium-term MA</span>
            </div>
            <span className="level-value" id="level-ema50">{formatValue(analysis?.ema50)}</span>
          </div>
          <div className="level-item">
            <div className="level-item__meta">
              <span className="level-label">Support</span>
              <span className="level-item__hint">Nearest floor</span>
            </div>
            <span className="level-value bull" id="level-support">{formatLevel(analysis?.nearestSupport)}</span>
          </div>
          <div className="level-item">
            <div className="level-item__meta">
              <span className="level-label">Resistance</span>
              <span className="level-item__hint">Nearest ceiling</span>
            </div>
            <span className="level-value bear" id="level-resistance">{formatLevel(analysis?.nearestResistance)}</span>
          </div>
        </div>
      </div>

      <div className="panel-card" id="pivot-info-panel">
        <div className="panel-card-header">
          <span className="panel-title">Pivot Points</span>
        </div>

        <div className="pivot-meta-row">
          <div className="pivot-meta-item">
            <span className="summary-label">Price Zone</span>
            <span id="pivot-zone-tag" className={`tag ${pivotAnalysis?.zone ? `zone-block--${zoneBucket(pivotAnalysis.zone)}` : ''}`}>
              {pivotAnalysis?.zone ? pivotAnalysis.zone.replace(/_/g, ' ') : '—'}
            </span>
          </div>
          <div className="pivot-meta-item">
            <span className="summary-label">Session Bias</span>
            <span id="pivot-bias-tag" className={`tag ${pivotAnalysis?.bias === 'bullish' ? 'tag--bull' : pivotAnalysis?.bias === 'bearish' ? 'tag--bear' : ''}`}>
              {pivotAnalysis?.bias || '—'}
            </span>
          </div>
        </div>

        <div className="pivot-ladder">
          <div className="plevel plevel--r">
            <span className="plevel__label">R3</span><strong className="plevel__value" id="pv-R3">{pivots?.R3 ?? '—'}</strong>
          </div>
          <div className="plevel plevel--r">
            <span className="plevel__label">R2</span><strong className="plevel__value" id="pv-R2">{pivots?.R2 ?? '—'}</strong>
          </div>
          <div className="plevel plevel--r">
            <span className="plevel__label">R1</span><strong className="plevel__value" id="pv-R1">{pivots?.R1 ?? '—'}</strong>
          </div>
          <div className="plevel plevel--pp">
            <span className="plevel__label">PP</span><strong className="plevel__value" id="pv-PP">{pivots?.PP ?? '—'}</strong>
          </div>
          <div className="plevel plevel--s">
            <span className="plevel__label">S1</span><strong className="plevel__value" id="pv-S1">{pivots?.S1 ?? '—'}</strong>
          </div>
          <div className="plevel plevel--s">
            <span className="plevel__label">S2</span><strong className="plevel__value" id="pv-S2">{pivots?.S2 ?? '—'}</strong>
          </div>
          <div className="plevel plevel--s">
            <span className="plevel__label">S3</span><strong className="plevel__value" id="pv-S3">{pivots?.S3 ?? '—'}</strong>
          </div>
        </div>

        {pivotAnalysis?.atInflectionPoint && pivotAnalysis?.inflectionLevel && (
          <div id="pivot-inflection" className="inflection-alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>Inflection: <strong id="pivot-inflection-level">{pivotAnalysis?.inflectionLevel?.label} @ {pivotAnalysis?.inflectionLevel?.value}</strong></span>
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

      <div className="panel-card wide tall-dashboard-panel" id="trade-logic-panel">
        <div className="panel-card-header">
          <span className="panel-title">Trade Logic</span>
        </div>
        <div className="trade-scenarios">
          <div className="scenario bull-scenario">
            <div className="scenario-header">Bullish Scenario</div>
            <p id="trade-bull">{analysis?.bullishScenario || 'Awaiting analysis...'}</p>
            <div className="invalidation invalidation--bear">
              <span className="invalidation__label">Invalidates if</span>
              <span id="inv-bull" className="invalidation__value">{analysis?.invalidationBull || '—'}</span>
            </div>
          </div>
          <div className="scenario bear-scenario">
            <div className="scenario-header">Bearish Scenario</div>
            <p id="trade-bear">{analysis?.bearishScenario || 'Awaiting analysis...'}</p>
            <div className="invalidation invalidation--bull">
              <span className="invalidation__label">Invalidates if</span>
              <span id="inv-bear" className="invalidation__value">{analysis?.invalidationBear || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-card tall-dashboard-panel">
        <div className="panel-card-header panel-card-header--flush">
          <span className="panel-title panel-title--regular">Recent Swing Points</span>
          <span className="text-sm-muted">
            {(analysis?.swingHighs?.length || 0) + (analysis?.swingLows?.length || 0)} points
          </span>
        </div>
        <div className="mt-4">
          {(() => {
            if (!analysis) return <div className="swing-item text-muted">—</div>;
            
            const highs = (analysis.swingHighs || []).map(h => ({ ...h, type: 'SH', price: Number(h.price) }));
            const lows = (analysis.swingLows || []).map(l => ({ ...l, type: 'SL', price: Number(l.price) }));
            
            const allSwings = [...highs, ...lows].sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0));
            if (allSwings.length === 0) return <div className="swing-item text-muted">—</div>;
            
            const prices = allSwings.map(s => s.price);
            const rangeMin = Math.min(...prices) * 0.99;
            const rangeMax = Math.max(...prices) * 1.01;
            const currentPrice = Number(analysis?.latestPrice ?? 0);
            
            return allSwings.map((swing, idx) => {
              const posPercent = rangeMax === rangeMin ? 50 : ((swing.price - rangeMin) / (rangeMax - rangeMin)) * 100;
              let distText = '—';
              let distClass = '';
              if (currentPrice) {
                const dist = ((currentPrice - swing.price) / swing.price) * -100; // how far current is from swing
                distText = `${dist > 0 ? '+' : ''}${dist.toFixed(2)}%`;
                distClass = dist > 0 ? 'bull' : 'bear';
              }
              return (
                <div key={idx} className="swing-item">
                  <span className={`swing-badge ${swing.type === 'SH' ? 'sh' : 'sl'}`}>{swing.type}</span>
                  <span className="swing-price">{swing.price.toFixed(2)}</span>
                  
                  <div className="swing-bar-container" title={`Price: ${swing.price.toFixed(2)}`}>
                    <div
                      className={`swing-bar-fill ${swing.type === 'SH' ? 'swing-bar-fill--bull' : 'swing-bar-fill--bear'}`}
                      style={{
                        width: `${swing.type === 'SH' ? 100 - posPercent : posPercent}%`,
                        [swing.type === 'SH' ? 'right' : 'left']: 0
                      }}
                    ></div>
                  </div>

                  <span className={`swing-dist ${distClass}`}>{distText}</span>
                  <span className="swing-time">{formatSwingTime(swing.time)}</span>
                </div>
              );
            });
          })()}
        </div>
      </div>
    </>
  )
}