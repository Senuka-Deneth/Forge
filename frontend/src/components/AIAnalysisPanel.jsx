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
        <div id="ai-loading" className="ai-loading fade-in">
          <div className="ai-loading-header">
            <div className="ai-loading-dots">
              <span></span><span></span><span></span>
            </div>
            <span className="ai-loading-text-label" id="ai-loading-msg">{loadingMsg}</span>
          </div>
          {/* Step progress */}
          <div style={{ display: 'flex', gap: '6px', margin: '4px 0 8px' }}>
            {['Deep reasoning', 'Signal verification', 'JSON output'].map((step, i) => {
              const msgIdx = ['Turn 1', 'Turn 2', 'Finalizing'].map(m => loadingMsg.includes(m) ? true : false);
              const active = i === 0 || msgIdx[i - 1];
              return (
                <div key={i} style={{
                  flex: 1, height: '2px', borderRadius: '2px',
                  background: active ? 'var(--accent-primary)' : 'var(--border-medium)',
                  transition: 'background 0.4s ease',
                  opacity: active ? 1 : 0.4
                }} />
              );
            })}
          </div>
          {/* Skeleton preview of cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: 'span 2', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="ai-skeleton-line w-30" style={{ height: '10px', width: '30%' }}></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[1,2,3,4].map(i => <div key={i} className="ai-skeleton-line" style={{ height: '34px', flex: 1, marginBottom: 0 }}></div>)}
              </div>
              <div className="ai-skeleton-line w-100"></div>
              <div className="ai-skeleton-line w-85"></div>
            </div>
            <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="ai-skeleton-line w-30" style={{ height: '10px', width: '40%' }}></div>
              {[1,2,3,4,5].map(i => <div key={i} className="ai-skeleton-line w-100" style={{ height: '10px' }}></div>)}
            </div>
            <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="ai-skeleton-line w-30" style={{ height: '10px', width: '40%' }}></div>
              {[1,2,3,4].map(i => <div key={i} className="ai-skeleton-line w-85" style={{ height: '10px' }}></div>)}
            </div>
          </div>
        </div>
      )}

      {aiError && !aiLoading && (
        <div id="ai-error" className="ai-error-box fade-in" style={{
          display: 'flex', alignItems: 'center', gap: '8px', 
          color: 'var(--color-bear)', fontFamily: 'var(--font-ui)', fontSize: '14px'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:'16px', height:'16px'}}>
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Analysis failed. Try again.</span>
          <button className="btn-ghost" onClick={onRefresh} style={{marginLeft: 'auto'}}>Retry</button>
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
        <div id="ai-content" className="ai-content-grid fade-in">

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
