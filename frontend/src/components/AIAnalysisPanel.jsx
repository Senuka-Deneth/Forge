import React, { useState, useEffect, useMemo } from 'react';

const POSITION_CALC_STORAGE_KEY = 'forge_position_calc';

function loadPositionCalcDefaults() {
  try {
    const raw = localStorage.getItem(POSITION_CALC_STORAGE_KEY);
    if (!raw) return { accountSize: 1000, riskPct: 1 };
    const parsed = JSON.parse(raw);
    return {
      accountSize: Number.isFinite(parsed.accountSize) ? parsed.accountSize : 1000,
      riskPct: Number.isFinite(parsed.riskPct) ? parsed.riskPct : 1,
    };
  } catch {
    return { accountSize: 1000, riskPct: 1 };
  }
}

function PositionSizeCalculator({ entry, stop }) {
  const defaults = useMemo(loadPositionCalcDefaults, []);
  const [accountSize, setAccountSize] = useState(defaults.accountSize);
  const [riskPct, setRiskPct] = useState(defaults.riskPct);

  useEffect(() => {
    localStorage.setItem(POSITION_CALC_STORAGE_KEY, JSON.stringify({ accountSize, riskPct }));
  }, [accountSize, riskPct]);

  const riskPerUnit = entry != null && stop != null ? Math.abs(entry - stop) : null;
  const riskAmount = accountSize > 0 && riskPct > 0 ? accountSize * (riskPct / 100) : 0;
  const positionSize = riskPerUnit && riskPerUnit > 0 ? riskAmount / riskPerUnit : null;
  const positionValue = positionSize != null && entry != null ? positionSize * entry : null;

  return (
    <div className="position-calc">
      <div className="position-calc-inputs">
        <label>
          Account size ($)
          <input
            type="number"
            min="0"
            value={accountSize}
            onChange={(e) => setAccountSize(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Risk per trade (%)
          <input
            type="number"
            min="0"
            step="0.1"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      {riskPerUnit == null ? (
        <p className="ai-signal-note">Set an entry and stop to size a position.</p>
      ) : (
        <div className="ai-rows">
          <div className="ai-row">
            <span>Risk amount</span>
            <span>${riskAmount.toFixed(2)}</span>
          </div>
          <div className="ai-row">
            <span>Position size</span>
            <span>{positionSize != null ? positionSize.toFixed(6) : '—'} units</span>
          </div>
          <div className="ai-row">
            <span>Position value</span>
            <span>{positionValue != null ? `$${positionValue.toFixed(2)}` : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const colorMap = {
  // Trends & Momentum
  bullish: 'var(--bull)',
  strong_bullish: 'var(--bull)',
  bearish: 'var(--bear)',
  strong_bearish: 'var(--bear)',
  neutral: 'var(--neutral)',
  sideways: 'var(--neutral)',
  long: 'var(--bull)',
  short: 'var(--bear)',
  wait: 'var(--neutral)',
  
  // RSI / Indicators
  overbought: 'var(--bear)',
  oversold: 'var(--bull)',
  bullish_momentum: 'var(--bull)',
  bearish_momentum: 'var(--bear)',
  bullish_zone: 'var(--bull)',
  bearish_zone: 'var(--bear)',
  above: 'var(--bull)',
  below: 'var(--bear)',
  
  // Wyckoff Phases
  accumulation: 'var(--neutral)',
  markup: 'var(--bull)',
  distribution: 'var(--neutral)',
  markdown: 'var(--bear)',
  
  // Significance / Severity
  high: 'var(--bear)',
  medium: 'var(--neutral)',
  low: 'var(--info)',
  
  // Regimes
  trending: 'var(--info)',
  ranging: 'var(--neutral)',
  breakout: 'var(--accent-primary)',
  reversal: 'var(--neutral)',
  
  // Zones
  between_pp_r1: 'var(--bull)',
  between_r1_r2: 'var(--bull)',
  between_r2_r3: 'var(--bull)',
  above_r3: 'var(--bull)',
  between_s1_pp: 'var(--bear)',
  between_s2_s1: 'var(--bear)',
  between_s3_s2: 'var(--bear)',
  below_s3: 'var(--bear)',
  
  none: 'transparent',
}

function StatusPill({ value }) {
  if (value == null) return <span className="status-pill" style={{ color: 'inherit', opacity: 0.5 }}>—</span>
  
  const valStr = String(value).toLowerCase()
  const display = String(value).replace(/_/g, ' ').toUpperCase()
  const color = colorMap[valStr] ?? 'var(--text-muted)'
  
  const isTransparent = color === 'transparent'
  
  return (
    <span className="status-pill" style={{ 
      backgroundColor: isTransparent ? 'rgba(255,255,255,0.05)' : `var(--${color.replace('var(--', '').replace(')', '')}-soft, rgba(255,255,255,0.1))`,
      color: color,
      border: `1px solid ${isTransparent ? 'var(--border-subtle)' : color}`,
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '0.02em',
      display: 'inline-flex',
      alignItems: 'center'
    }}>
      {display}
    </span>
  )
}

export default function AIAnalysisPanel({ aiAnalysis, aiLoading, aiError, onRefresh }) {
  const a = aiAnalysis

  const [loadingMsg, setLoadingMsg] = useState('Running fast market analysis...');

  useEffect(() => {
    if (aiLoading) {
      const messages = [
        'Running fast market analysis...',
        'Validating signal consistency...',
        'Finalizing validated output...'
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
      }, 4500);
      return () => clearInterval(interval);
    }
  }, [aiLoading]);

  const isLiveAI = a?._meta?.source === 'openrouter'
  const modelLabel = a?._meta?.model ?? 'model pending'

  return (
    <div id="ai-analysis-section" className="ai-section">
      <div className="ai-section-header">
        <div className="ai-section-title">
          <span>AI Analysis</span>
          <span className="model-tag" id="ai-model-tag">{modelLabel}</span>
          {a && (
            <span
              className="panel-badge"
              title={isLiveAI ? 'Generated by the live AI model.' : 'AI model was unavailable; this is a rules-based fallback, not a model-generated read.'}
              style={{
                marginLeft: '8px',
                backgroundColor: isLiveAI ? 'var(--bull-soft)' : 'var(--neutral-soft)',
                color: isLiveAI ? 'var(--bull)' : 'var(--neutral)',
              }}
            >
              {isLiveAI ? 'Live AI' : 'Rules-based fallback'}
            </span>
          )}
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
            {['Fast inference', 'Validation', 'Output'].map((step, i) => {
              const msgIdx = ['fast market analysis', 'signal consistency', 'Finalizing'].map(m => loadingMsg.toLowerCase().includes(m.toLowerCase()) ? true : false);
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div style={{ gridColumn: 'span 2', background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="ai-skeleton-line w-30" style={{ height: '10px', width: '30%' }}></div>
              <div style={{ display: 'flex', gap: '12px' }}>
                {[1,2,3,4].map(i => <div key={i} className="ai-skeleton-line" style={{ height: '34px', flex: 1, marginBottom: 0 }}></div>)}
              </div>
              <div className="ai-skeleton-line w-100"></div>
              <div className="ai-skeleton-line w-85"></div>
            </div>
            <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="ai-skeleton-line w-30" style={{ height: '10px', width: '40%' }}></div>
              {[1,2,3,4,5].map(i => <div key={i} className="ai-skeleton-line w-100" style={{ height: '10px' }}></div>)}
            </div>
            <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
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
              <div className="ai-kpi">
                <label>Volatility</label>
                <div id="ai-volatility"><StatusPill value={a.market_regime?.volatility} /></div>
              </div>
              <div className="ai-kpi">
                <label>MTF Confluence</label>
                <div id="ai-confluence">{a._meta?.confluence_score != null ? `${a._meta.confluence_score}%` : '—'}</div>
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
                  <span id="ai-pivot-target-bull" style={{ color: 'var(--bull)', fontWeight: '600' }}>
                    {a.pivot_analysis.pivot_target_bull ? `${a.pivot_analysis.pivot_target_bull.label} @ ${a.pivot_analysis.pivot_target_bull.value}` : '—'}
                  </span>
                </div>
                <div className="ai-row">
                  <span>Bear Target</span>
                  <span id="ai-pivot-target-bear" style={{ color: 'var(--bear)', fontWeight: '600' }}>
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

          {a.trade_plan && (
            <div className="ai-card wide">
              <div className="ai-card-header">Trade Plan</div>
              <div className="ai-summary-strip">
                <div className="ai-kpi">
                  <label>Plan Bias</label>
                  <div><StatusPill value={a.trade_plan.bias} /></div>
                </div>
                <div className="ai-kpi">
                  <label>Entry Zone</label>
                  <span>
                    {a.trade_plan.entry_zone
                      ? `${a.trade_plan.entry_zone.low ?? '—'} – ${a.trade_plan.entry_zone.high ?? '—'}`
                      : '—'}
                  </span>
                </div>
                <div className="ai-kpi">
                  <label>Stop Loss</label>
                  <span style={{ color: 'var(--bear)', fontWeight: 600 }}>{a.trade_plan.stop_loss ?? '—'}</span>
                </div>
                <div className="ai-kpi">
                  <label>Plan Confidence</label>
                  <span>{a.trade_plan.confidence ?? 0}%</span>
                </div>
              </div>

              {a.trade_plan.targets?.length > 0 && (
                <div className="ai-rows">
                  {a.trade_plan.targets.map((t, i) => (
                    <div className="ai-row" key={i}>
                      <span>{t.label}</span>
                      <span>{t.price ?? '—'}{t.risk_reward != null ? ` · ${t.risk_reward}:1 R:R` : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {a.trade_plan.risk_reward_summary && (
                <p className="ai-signal-note">{a.trade_plan.risk_reward_summary}</p>
              )}
              {a.trade_plan.rationale && (
                <p id="ai-trade-plan-rationale" className="ai-reasoning-text">{a.trade_plan.rationale}</p>
              )}

              {a.trade_plan.bias !== 'wait' && (
                <PositionSizeCalculator entry={a.trade_plan.entry_zone?.high ?? a.trade_plan.entry_zone?.low} stop={a.trade_plan.stop_loss} />
              )}
            </div>
          )}

          <div className="ai-card">
            <div className="ai-card-header">Order Flow &amp; Positioning</div>
            <div className="ai-rows">
              <div className="ai-row">
                <span>Order Book Imbalance</span>
                <span>{a.order_flow?.obi != null ? `${(a.order_flow.obi * 100).toFixed(1)}%` : 'unavailable'}</span>
              </div>
              <div className="ai-row">
                <span>Dominant Side</span>
                <div><StatusPill value={a.order_flow?.dominant_side} /></div>
              </div>
              <div className="ai-row">
                <span>Futures Data</span>
                <span>{a._meta?.data_completeness?.futures_available ? 'available' : 'unavailable (spot only)'}</span>
              </div>
            </div>
            {a.order_flow?.interpretation && (
              <p className="ai-signal-note">{a.order_flow.interpretation}</p>
            )}
          </div>

          <div className="ai-card wide">
            <div className="ai-card-header">AI Trade Logic</div>
            <div className="trade-scenarios">
              <div className="scenario bull-scenario">
                <div className="scenario-header" style={{ color: 'var(--bull)' }}>Bullish Scenario</div>
                <p id="ai-bull-scenario">{a.trade_logic?.bullish_scenario ?? '—'}</p>
                <small>Invalidation: <strong id="ai-invalidation-bull" style={{ color: 'var(--bear)' }}>{a.trade_logic?.invalidation_bull ?? '—'}</strong></small>
              </div>
              <div className="scenario bear-scenario">
                <div className="scenario-header" style={{ color: 'var(--bear)' }}>Bearish Scenario</div>
                <p id="ai-bear-scenario">{a.trade_logic?.bearish_scenario ?? '—'}</p>
                <small>Invalidation: <strong id="ai-invalidation-bear" style={{ color: 'var(--bull)' }}>{a.trade_logic?.invalidation_bear ?? '—'}</strong></small>
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
