import React, { useState, useEffect } from 'react';

const colorMap = {
  bullish: 'var(--bull)',
  strong_bullish: 'var(--bull)',
  bearish: 'var(--bear)',
  strong_bearish: 'var(--bear)',
  neutral: 'var(--neutral)',
  sideways: 'var(--neutral)',
  long: 'var(--bull)',
  short: 'var(--bear)',
  wait: 'var(--neutral)',
  overbought: 'var(--bear)',
  oversold: 'var(--bull)',
  bullish_zone: 'var(--bull)',
  bearish_zone: 'var(--bear)',
  high: 'var(--bear)',
  medium: 'var(--neutral)',
  low: 'var(--bull)',
  trending: 'var(--info)',
  ranging: 'var(--neutral)',
  breakout: 'var(--accent)',
  reversal: 'var(--neutral)',
  none: 'transparent',
}

function StatusPill({ value }) {
  if (value == null) return <span className="status-pill" style={{ color: 'inherit', border: '1px solid var(--border-default)' }}>—</span>
  const display = String(value).replace(/_/g, ' ')
  const bg = colorMap[value] ?? 'transparent'
  return (
    <span className="status-pill" style={{ 
      backgroundColor: bg !== 'transparent' ? bg : 'rgba(255,255,255,0.1)', 
      color: bg !== 'transparent' ? '#fff' : 'inherit' 
    }}>
      {display}
    </span>
  )
}

export default function AIAnalysisPanel({ aiAnalysis, aiLoading, aiError, onRefresh }) {
  const a = aiAnalysis

  const [loadingMsg, setLoadingMsg] = useState('Running 2-turn reasoning analysis...');

  useEffect(() => {
    if (aiLoading) {
      const messages = [
        'Running 2-turn reasoning analysis...',
        'Turn 1: Deep market reasoning in progress...',
        'Turn 2: Verifying signals and confluences...',
        'Finalizing JSON output...'
      ];
      let i = 0;
      setLoadingMsg(messages[0]);
      const interval = setInterval(() => {
        i++;
        if (i < messages.length) {
          setLoadingMsg(messages[i]);
        } else {
          clearInterval(interval);
        }
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [aiLoading]);

  return (
    <div id="ai-analysis-section" className="ai-section">
      <div className="ai-section-header">
        <div className="ai-section-title">
          <span>AI Analysis</span>
          <span className="model-tag" id="ai-model-tag">nemotron-120b · 2-turn reasoning</span>
        </div>
        <div className="ai-section-actions">
          <span 
            id="ai-status-badge" 
            className="panel-badge"
            style={{
              backgroundColor: aiLoading
                ? 'var(--neutral-soft)'
                : aiError
                  ? 'var(--bear-soft)'
                  : a
                    ? 'var(--bull-soft)'
                    : 'var(--bg-input)',
              color: aiLoading
                ? 'var(--neutral)'
                : aiError
                  ? 'var(--bear)'
                  : a
                    ? 'var(--bull)'
                    : 'var(--text-muted)'
            }}
          >
            {aiLoading ? 'Analyzing…' : aiError ? 'Error' : a ? 'Ready' : 'Waiting'}
          </span>
          <button className="btn-ghost" id="ai-refresh-btn" onClick={onRefresh} disabled={aiLoading}>
            Refresh
          </button>
        </div>
      </div>

      {aiLoading && (
        <div id="ai-loading" className="ai-loading">
          <div className="loading-spinner"></div>
          <div className="loading-text">
            <span id="ai-loading-msg">{loadingMsg}</span>
            <span className="loading-sub">This takes 15–30 seconds</span>
          </div>
        </div>
      )}

      {aiError && !aiLoading && (
        <div id="ai-error" className="ai-error-box">
          <strong>AI Error:</strong> {aiError}
        </div>
      )}

      {!aiLoading && !aiError && !a && (
        <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
          <p style={{ marginBottom: '16px' }}>No AI analysis generated yet.</p>
          <button 
            className="ai-create-btn" 
            onClick={onRefresh}
            style={{
              padding: '10px 20px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            Create AI Analysis
          </button>
        </div>
      )}

      {!aiLoading && a && (
        <div id="ai-content" className="ai-content-grid">

          <div className="ai-card wide">
            <div className="ai-card-header">Market Intelligence</div>
            <div className="ai-summary-strip">
              <div className="ai-kpi">
                <label>Trend</label>
                <div id="ai-trend"><StatusPill value={a.summary?.primary_trend} /></div>
              </div>
              <div className="ai-kpi">
                <label>Momentum</label>
                <div id="ai-momentum"><StatusPill value={a.summary?.momentum} /></div>
              </div>
              <div className="ai-kpi">
                <label>Phase</label>
                <div id="ai-phase"><StatusPill value={a.summary?.phase} /></div>
              </div>
              <div className="ai-kpi">
                <label>Regime</label>
                <div id="ai-regime"><StatusPill value={a.market_regime?.regime} /></div>
              </div>
              <div className="ai-kpi">
                <label>Bias</label>
                <div id="ai-bias"><StatusPill value={a.summary?.bias} /></div>
              </div>
              <div className="ai-kpi wide-kpi">
                <label>AI Confidence</label>
                <div className="conf-track">
                  <div id="ai-confidence-bar" className="conf-fill" style={{
                    width: `${a.summary?.confidence ?? 0}%`,
                    backgroundColor: (a.summary?.confidence ?? 0) >= 70 ? 'var(--bull)' : (a.summary?.confidence ?? 0) >= 40 ? 'var(--neutral)' : 'var(--bear)'
                  }}></div>
                  <span id="ai-confidence-val">{a.summary?.confidence ?? 0}%</span>
                </div>
              </div>
            </div>
            {a.summary?.reasoning && (
              <p id="ai-reasoning" className="ai-reasoning-text">{a.summary.reasoning}</p>
            )}
          </div>

          <div className="ai-card">
            <div className="ai-card-header">Indicator Readings</div>
            <div className="ai-rows">
              <div className="ai-row">
                <span>RSI State</span>
                <div id="ai-rsi-state"><StatusPill value={a.indicators?.rsi?.state} /></div>
              </div>
              <div className="ai-row">
                <span>RSI Divergence</span>
                <div id="ai-rsi-div"><StatusPill value={a.indicators?.rsi?.divergence} /></div>
              </div>
              <div className="ai-row">
                <span>MACD</span>
                <div id="ai-macd-state"><StatusPill value={a.indicators?.macd?.state} /></div>
              </div>
              <div className="ai-row">
                <span>EMA Alignment</span>
                <div id="ai-ema-align"><StatusPill value={a.indicators?.ema?.alignment} /></div>
              </div>
              <div className="ai-row">
                <span>Price vs EMA 20</span>
                <div id="ai-price-ema20"><StatusPill value={a.indicators?.ema?.price_vs_ema20} /></div>
              </div>
            </div>
            {a.indicators?.rsi?.signal && (
              <p id="ai-rsi-signal" className="ai-signal-note">{a.indicators.rsi.signal}</p>
            )}
          </div>

          {/* Pivot Intelligence */}
          {a.pivot_analysis && (
            <div className="ai-card">
              <div className="ai-card-header">Pivot Intelligence</div>
              <div className="ai-rows">
                <div className="ai-row">
                  <span>PP Level</span>
                  <span id="ai-pp-value">{a.pivot_analysis.pp ?? '—'}</span>
                </div>
                <div className="ai-row">
                  <span>Zone</span>
                  <div id="ai-pivot-zone"><StatusPill value={a.pivot_analysis.current_zone} /></div>
                </div>
                <div className="ai-row">
                  <span>Session Bias</span>
                  <div id="ai-pivot-bias"><StatusPill value={a.pivot_analysis.session_bias} /></div>
                </div>
                <div className="ai-row">
                  <span>Bull Target</span>
                  <span id="ai-pivot-target-bull" className="bull">
                    {a.pivot_analysis.pivot_target_bull ? `${a.pivot_analysis.pivot_target_bull.label} @ ${a.pivot_analysis.pivot_target_bull.value}` : '—'}
                  </span>
                </div>
                <div className="ai-row">
                  <span>Bear Target</span>
                  <span id="ai-pivot-target-bear" className="bear">
                    {a.pivot_analysis.pivot_target_bear ? `${a.pivot_analysis.pivot_target_bear.label} @ ${a.pivot_analysis.pivot_target_bear.value}` : '—'}
                  </span>
                </div>
              </div>
              
              {a.pivot_analysis.at_inflection_point && a.pivot_analysis.inflection_level && (
                <div id="ai-inflection-alert" className="inflection-alert">
                  ⚡ At inflection: <strong id="ai-inflection-val">{a.pivot_analysis.inflection_level}</strong>
                </div>
              )}
              
              {a.pivot_analysis.pivot_signal && (
                <p id="ai-pivot-signal" className="ai-signal-note">{a.pivot_analysis.pivot_signal}</p>
              )}
            </div>
          )}

          <div className="ai-card wide">
            <div className="ai-card-header">AI Trade Logic</div>
            <div className="trade-scenarios">
              <div className="scenario bull-scenario">
                <div className="scenario-header">Bullish Scenario</div>
                <p id="ai-bull-scenario">{a.trade_logic?.bullish_scenario ?? '—'}</p>
                <small>Invalidation: <strong id="ai-invalidation-bull" className="bear">{a.trade_logic?.invalidation_bull ?? '—'}</strong></small>
              </div>
              <div className="scenario bear-scenario">
                <div className="scenario-header">Bearish Scenario</div>
                <p id="ai-bear-scenario">{a.trade_logic?.bearish_scenario ?? '—'}</p>
                <small>Invalidation: <strong id="ai-invalidation-bear" className="bull">{a.trade_logic?.invalidation_bear ?? '—'}</strong></small>
              </div>
            </div>
            {a.trade_logic?.risk_note && (
              <div className="risk-note-box">
                <span>⚠️</span>
                <p id="ai-risk-note">{a.trade_logic.risk_note}</p>
              </div>
            )}
          </div>

          <div className="ai-card tall-card">
            <div className="ai-card-header">Pivot Confluences</div>
            <div id="ai-confluences" className="confluence-list">
              {a.pivot_analysis?.confluences?.length > 0 ? (
                a.pivot_analysis.confluences.map((c, i) => (
                  <div key={i} className="confluence-item">
                    <StatusPill value={c.significance} />
                    <span>{c.level} @ {c.price}</span>
                    <span>Confluent with {c.confluent_with}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No significant confluences detected.</span>
              )}
            </div>
          </div>

          <div className="ai-card tall-card">
            <div className="ai-card-header">Anomalies &amp; Alerts</div>
            <div id="ai-anomalies" className="anomaly-list">
              {a.anomalies?.filter((x) => x.type !== 'none').length > 0 ? (
                a.anomalies
                  .filter((x) => x.type !== 'none')
                  .map((anom, i) => (
                    <div key={i} className="anomaly-item">
                      <StatusPill value={anom.severity} />
                      <span>{anom.type?.replace(/_/g, ' ')}</span>
                      <span>{anom.description}</span>
                    </div>
                  ))
              ) : (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No anomalies detected.</span>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
