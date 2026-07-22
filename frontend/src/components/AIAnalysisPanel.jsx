import React, { useState, useEffect, useMemo } from 'react';
import VerdictPanel from './VerdictPanel';
import { supabase } from '../supabaseClient';

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
        <div className="stack-2">
          <div className="row-between">
            <span>Risk amount</span>
            <span>${riskAmount.toFixed(2)}</span>
          </div>
          <div className="row-between">
            <span>Position size</span>
            <span>{positionSize != null ? positionSize.toFixed(6) : '—'} units</span>
          </div>
          <div className="row-between">
            <span>Position value</span>
            <span>{positionValue != null ? `$${positionValue.toFixed(2)}` : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Collapses the model's many status/state vocabularies down to a single tag tone.
const BULL_STATES = new Set([
  'bullish', 'strong_bullish', 'long', 'oversold', 'bullish_momentum', 'bullish_zone', 'above', 'markup',
  'between_pp_r1', 'between_r1_r2', 'between_r2_r3', 'above_r3',
]);
const BEAR_STATES = new Set([
  'bearish', 'strong_bearish', 'short', 'overbought', 'bearish_momentum', 'bearish_zone', 'below', 'markdown', 'high',
  'between_s1_pp', 'between_s2_s1', 'between_s3_s2', 'below_s3',
]);
const ACCENT_STATES = new Set(['breakout']);

function statusTone(value) {
  if (value == null) return 'muted';
  const key = String(value).toLowerCase();
  if (BULL_STATES.has(key)) return 'bull';
  if (BEAR_STATES.has(key)) return 'bear';
  if (ACCENT_STATES.has(key)) return 'accent';
  return 'muted';
}

function StatusPill({ value }) {
  if (value == null) return <span className="tag tag--muted">—</span>

  const display = String(value).replace(/_/g, ' ').toUpperCase()
  const tone = statusTone(value)

  return <span className={`tag tag--${tone}`}>{display}</span>
}

function alertDirection(level, currentPrice) {
  if (currentPrice == null || !Number.isFinite(currentPrice) || !Number.isFinite(level)) return 'above';
  return level >= currentPrice ? 'above' : 'below';
}

export default function AIAnalysisPanel({
  aiAnalysis,
  aiLoading,
  aiError,
  onRefresh,
  symbol,
  currentPrice,
}) {
  const a = aiAnalysis

  const [loadingMsg, setLoadingMsg] = useState('Running fast market analysis...');
  const [alertStatus, setAlertStatus] = useState('');

  useEffect(() => {
    if (!aiLoading) return undefined;
    const messages = [
      'Running fast market analysis...',
      'Validating signal consistency...',
      'Finalizing validated output...'
    ];
    let i = 0;
    const timeoutId = setTimeout(() => setLoadingMsg(messages[0]), 0);
    const interval = setInterval(() => {
      i++;
      if (i < messages.length) {
        setLoadingMsg(messages[i]);
      } else {
        clearInterval(interval);
      }
    }, 4500);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [aiLoading]);

  const handleOverride = async (guardrailId) => {
    if (!supabase || !a?._meta?.analysis_id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      const { error } = await supabase.from('risk_overrides').insert({
        user_id: user.id,
        analysis_id: a._meta.analysis_id,
        guardrail_id: guardrailId,
      });
      if (error) console.error('[AIAnalysisPanel] risk_overrides insert failed:', error.message);
    } catch (err) {
      console.error('[AIAnalysisPanel] override logging failed:', err);
    }
  };

  const createPriceAlert = async (source, level) => {
    const numericLevel = Number(level);
    if (!supabase || !Number.isFinite(numericLevel) || numericLevel <= 0) {
      setAlertStatus('No level available for alert.');
      return;
    }
    const alertSymbol = String(symbol || '').toUpperCase();
    if (!/^[A-Z0-9]{5,20}$/.test(alertSymbol)) {
      setAlertStatus('Symbol unavailable — reload analysis and retry.');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setAlertStatus('Sign in to arm price alerts.');
        return;
      }
      const { error } = await supabase.from('price_alerts').insert({
        user_id: user.id,
        symbol: alertSymbol,
        level: numericLevel,
        direction: alertDirection(numericLevel, currentPrice),
        source,
        armed: true,
        analysis_id: a?._meta?.analysis_id ?? null,
      });
      if (error) {
        setAlertStatus(error.message || 'Failed to create alert.');
        return;
      }
      setAlertStatus(`Alert armed @ ${numericLevel} (${source.replace(/_/g, ' ')})`);
    } catch (err) {
      setAlertStatus(err.message || 'Failed to create alert.');
    }
  };

  const isLiveAI = a?._meta?.source === 'openrouter'
  const isPartialAI = a?._meta?.source === 'openrouter-partial'
  const provenanceLabel = isLiveAI ? 'Live AI' : isPartialAI ? 'Partial AI' : 'Baseline'
  const provenanceTone = isLiveAI ? 'bull' : isPartialAI ? 'accent' : 'muted'
  const modelLabel = a?._meta?.model ?? 'model pending'
  const statusTag = aiLoading ? 'accent' : aiError ? 'bear' : a ? 'bull' : 'muted'

  return (
    <div id="ai-analysis-section" className="ai-section">
      <div className="ai-section-header">
        <div className="ai-section-title">
          <span>AI Analysis</span>
          <span className="tag" id="ai-model-tag">{modelLabel}</span>
          {a && (
            <span
              className={`tag tag--${provenanceTone}`}
              title={isLiveAI ? 'Generated primarily by the live AI model.' : isPartialAI ? 'Model returned partial output; some fields use deterministic fallbacks.' : 'Rules-based baseline — model unavailable or mostly ignored.'}
            >
              {provenanceLabel}
            </span>
          )}
        </div>
        <div className="ai-section-actions">
          <span id="ai-status-badge" className={`tag tag--${statusTag}`}>
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

          <div className="ai-loading-steps">
            {['Fast inference', 'Validation', 'Output'].map((step, i) => {
              const msgIdx = ['fast market analysis', 'signal consistency', 'finalizing'].map((m) => loadingMsg.toLowerCase().includes(m));
              const active = i === 0 || msgIdx[i - 1];
              return <div key={i} className={`ai-loading-step ${active ? 'active' : ''}`} title={step} />;
            })}
          </div>

          <div className="ai-loading-skeleton">
            <div className="ai-loading-skeleton__card ai-loading-skeleton__card--wide">
              <span className="skeleton w-30">Loading trend summary</span>
              <div className="row">
                {[1, 2, 3, 4].map((i) => <span key={i} className="skeleton">Loading</span>)}
              </div>
              <span className="skeleton w-100">Loading reasoning placeholder line one</span>
              <span className="skeleton w-85">Loading reasoning placeholder line two</span>
            </div>
            <div className="ai-loading-skeleton__card">
              <span className="skeleton w-40">Loading indicators</span>
              {[1, 2, 3, 4, 5].map((i) => <span key={i} className="skeleton w-100">Loading indicator row</span>)}
            </div>
            <div className="ai-loading-skeleton__card">
              <span className="skeleton w-40">Loading pivots</span>
              {[1, 2, 3, 4].map((i) => <span key={i} className="skeleton w-85">Loading pivot row</span>)}
            </div>
          </div>
        </div>
      )}

      {aiError && !aiLoading && (
        <div id="ai-error" className="auth-error row-between fade-in">
          <div className="row">
            <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Analysis failed. Try again.</span>
          </div>
          <button className="btn-ghost" onClick={onRefresh}>Retry</button>
        </div>
      )}

      {!aiLoading && !aiError && !a && (
        <div className="empty-state text-center">
          <p className="mb-4">No AI analysis generated yet.</p>
          <button className="btn-primary" onClick={onRefresh}>
            Create AI Analysis
          </button>
        </div>
      )}

      {!aiLoading && a && (
        <div id="ai-content" className="ai-grid fade-in">
          <div className="col-span-all">
            <VerdictPanel analysis={a} onOverride={handleOverride} />
          </div>

          <div className="ai-card wide">
            <div className="ai-card-header">Market Intelligence</div>
            <div className="ai-summary">
              <div>
                <div className="ai-metric__label">Trend</div>
                <div id="ai-trend"><StatusPill value={a.summary?.primary_trend} /></div>
              </div>
              <div>
                <div className="ai-metric__label">Momentum</div>
                <div id="ai-momentum"><StatusPill value={a.summary?.momentum} /></div>
              </div>
              <div>
                <div className="ai-metric__label">Phase</div>
                <div id="ai-phase"><StatusPill value={a.summary?.phase} /></div>
              </div>
              <div>
                <div className="ai-metric__label">Regime</div>
                <div id="ai-regime"><StatusPill value={a.market_regime?.regime} /></div>
              </div>
              <div>
                <div className="ai-metric__label">Bias</div>
                <div id="ai-bias"><StatusPill value={a.summary?.bias} /></div>
              </div>
              <div>
                <div className="ai-metric__label">Volatility</div>
                <div id="ai-volatility"><StatusPill value={a.market_regime?.volatility} /></div>
              </div>
              <div>
                <div className="ai-metric__label" title="MTF alignment blended with signal agreement — not a probability">MTF+signal blend</div>
                <div id="ai-confluence">
                  {a._meta?.confluence_breakdown
                    ? `${a._meta.confluence_breakdown.mtf_confluence}% MTF (${a._meta.confluence_breakdown.mtf_sample_size} TFs) + ${a._meta.confluence_breakdown.signal_agreement}% signals`
                    : a._meta?.confluence_score != null ? `${a._meta.confluence_score}%` : '—'}
                </div>
              </div>
              <div className="col-span-all">
                <div className="ai-metric__label">Signal strength</div>
                <div className="confidence-bar-track">
                  <div
                    id="ai-confidence-bar"
                    className={`confidence-bar-fill ${(a.summary?.confidence ?? 0) >= 70 ? 'confidence-bar-fill--bull' : (a.summary?.confidence ?? 0) >= 40 ? '' : 'confidence-bar-fill--bear'}`}
                    style={{ width: `${a.summary?.confidence ?? 0}%` }}
                  ></div>
                </div>
                <span id="ai-confidence-val" className="text-sm-muted">{a.summary?.confidence ?? 0}%</span>
              </div>
            </div>
            {a.summary?.reasoning && (
              <p id="ai-reasoning" className="ai-reasoning">{a.summary.reasoning}</p>
            )}
          </div>

          <div className="ai-card">
            <div className="ai-card-header">Indicator Readings</div>
            <div className="stack-2">
              <div className="row-between">
                <span>RSI State</span>
                <div id="ai-rsi-state"><StatusPill value={a.indicators?.rsi?.state} /></div>
              </div>
              <div className="row-between">
                <span>RSI Divergence</span>
                <div id="ai-rsi-div"><StatusPill value={a.indicators?.rsi?.divergence} /></div>
              </div>
              <div className="row-between">
                <span>MACD</span>
                <div id="ai-macd-state"><StatusPill value={a.indicators?.macd?.state} /></div>
              </div>
              <div className="row-between">
                <span>EMA Alignment</span>
                <div id="ai-ema-align"><StatusPill value={a.indicators?.ema?.alignment} /></div>
              </div>
              <div className="row-between">
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
              <div className="stack-2">
                <div className="row-between">
                  <span>PP Level</span>
                  <span id="ai-pp-value">{a.pivot_analysis.pp ?? '—'}</span>
                </div>
                <div className="row-between">
                  <span>Zone</span>
                  <div id="ai-pivot-zone"><StatusPill value={a.pivot_analysis.current_zone} /></div>
                </div>
                <div className="row-between">
                  <span>Session Bias</span>
                  <div id="ai-pivot-bias"><StatusPill value={a.pivot_analysis.session_bias} /></div>
                </div>
                <div className="row-between">
                  <span>Bull Target</span>
                  <span id="ai-pivot-target-bull" className="bull">
                    {a.pivot_analysis.pivot_target_bull ? `${a.pivot_analysis.pivot_target_bull.label} @ ${a.pivot_analysis.pivot_target_bull.value}` : '—'}
                  </span>
                </div>
                <div className="row-between">
                  <span>Bear Target</span>
                  <span id="ai-pivot-target-bear" className="bear">
                    {a.pivot_analysis.pivot_target_bear ? `${a.pivot_analysis.pivot_target_bear.label} @ ${a.pivot_analysis.pivot_target_bear.value}` : '—'}
                  </span>
                </div>
              </div>

              {a.pivot_analysis.at_inflection_point && a.pivot_analysis.inflection_level && (
                <div id="ai-inflection-alert" className="inflection-alert">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  <span>At inflection: <strong id="ai-inflection-val">{a.pivot_analysis.inflection_level}</strong></span>
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
              <div className="ai-summary">
                <div>
                  <div className="ai-metric__label">Plan Bias</div>
                  <div><StatusPill value={a.trade_plan.bias} /></div>
                </div>
                <div>
                  <div className="ai-metric__label">Entry Zone</div>
                  <span>
                    {a.trade_plan.entry_zone
                      ? `${a.trade_plan.entry_zone.low ?? '—'} – ${a.trade_plan.entry_zone.high ?? '—'}`
                      : '—'}
                  </span>
                </div>
                <div>
                  <div className="ai-metric__label">Stop Loss</div>
                  <span className="bear">{a.trade_plan.stop_loss ?? '—'}</span>
                </div>
                <div>
                  <div className="ai-metric__label">Plan signal strength</div>
                  <span>
                    Model {a.trade_plan.confidence ?? 0}%
                    {a.trade_plan.empirical_confidence != null && (
                      <>
                        {' · '}
                        <span className={(a._meta?.calibration?.n ?? 0) < 20 ? 'low-confidence' : ''}>
                          Empirical {a.trade_plan.empirical_confidence}%
                          {a._meta?.calibration?.n != null ? ` (n=${a._meta.calibration.n})` : ''}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {a.trade_plan.targets?.length > 0 && (
                <div className="stack-2 mt-3">
                  {a.trade_plan.targets.map((t, i) => (
                    <div className="row-between" key={i}>
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
                <p id="ai-trade-plan-rationale" className="ai-reasoning">{a.trade_plan.rationale}</p>
              )}

              {a.trade_plan.bias !== 'wait' && (
                <>
                  <div className="row wrap mt-3">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        const mid = a.trade_plan.entry_zone
                          ? (Number(a.trade_plan.entry_zone.low) + Number(a.trade_plan.entry_zone.high)) / 2
                          : NaN;
                        const level = Number.isFinite(mid)
                          ? mid
                          : Number(a.trade_plan.entry_zone?.high ?? a.trade_plan.entry_zone?.low);
                        createPriceAlert('entry_zone', level);
                      }}
                    >
                      Alert @ entry
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => createPriceAlert('invalidation', a.trade_plan.stop_loss)}
                      disabled={a.trade_plan.stop_loss == null}
                    >
                      Alert @ invalidation
                    </button>
                  </div>
                  {alertStatus && (
                    <p className="ai-signal-note mt-2">{alertStatus}</p>
                  )}
                  <PositionSizeCalculator entry={a.trade_plan.entry_zone?.high ?? a.trade_plan.entry_zone?.low} stop={a.trade_plan.stop_loss} />
                </>
              )}
            </div>
          )}

          <div className="ai-card">
            <div className="ai-card-header">Order Flow &amp; Positioning</div>
            <div className="stack-2">
              <div className="row-between">
                <span>Order Book Imbalance</span>
                <span>{a.order_flow?.obi != null ? `${(a.order_flow.obi * 100).toFixed(1)}%` : 'unavailable'}</span>
              </div>
              <div className="row-between">
                <span>Dominant Side</span>
                <div><StatusPill value={a.order_flow?.dominant_side} /></div>
              </div>
              <div className="row-between">
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
              <div className="bull-scenario">
                <div className="scenario-header">Bullish Scenario</div>
                <p id="ai-bull-scenario">{a.trade_logic?.bullish_scenario ?? '—'}</p>
                <small>Invalidation: <strong id="ai-invalidation-bull" className="bear">{a.trade_logic?.invalidation_bull ?? '—'}</strong></small>
              </div>
              <div className="bear-scenario">
                <div className="scenario-header">Bearish Scenario</div>
                <p id="ai-bear-scenario">{a.trade_logic?.bearish_scenario ?? '—'}</p>
                <small>Invalidation: <strong id="ai-invalidation-bear" className="bull">{a.trade_logic?.invalidation_bear ?? '—'}</strong></small>
              </div>
            </div>
            {a.trade_logic?.risk_note && (
              <div className="auth-error row items-start mt-3">
                <svg className="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <p id="ai-risk-note">{a.trade_logic.risk_note}</p>
              </div>
            )}
          </div>

          <div className="ai-card">
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
                <span className="text-sm-muted">No significant confluences detected.</span>
              )}
            </div>
          </div>

          <div className="ai-card">
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
                <span className="text-sm-muted">No anomalies detected.</span>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
