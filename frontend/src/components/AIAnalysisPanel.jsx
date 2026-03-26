import React, { useState, useEffect } from 'react';

const colorMap = {
  bullish: '#22c55e',
  strong_bullish: '#00e676',
  bearish: '#ef4444',
  strong_bearish: '#d32f2f',
  neutral: '#94a3b8',
  sideways: '#f59e0b',
  long: '#22c55e',
  short: '#ef4444',
  wait: '#f59e0b',
  overbought: '#ef4444',
  oversold: '#22c55e',
  bullish_zone: '#4ade80',
  bearish_zone: '#fca5a5',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
  trending: '#60a5fa',
  ranging: '#f59e0b',
  breakout: '#a78bfa',
  reversal: '#fb923c',
  none: '#94a3b8',
  above: '#22c55e',
  below: '#ef4444',
  at: '#f59e0b',
  mixed: '#94a3b8',
  accumulation: '#60a5fa',
  markup: '#22c55e',
  distribution: '#f59e0b',
  markdown: '#ef4444',
  consolidation: '#94a3b8',
}

function Tag({ value }) {
  if (value == null) return <span className="ai-tag ai-tag-neutral">—</span>
  const display = String(value).replace(/_/g, ' ')
  const bg = colorMap[value] ?? '#334155'
  return (
    <span className="ai-tag" style={{ backgroundColor: bg }}>
      {display}
    </span>
  )
}

function Row({ label, children }) {
  return (
    <div className="ai-row">
      <span className="ai-row-label">{label}</span>
      <span className="ai-row-value">{children ?? '—'}</span>
    </div>
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
    <div className="ai-section">
      <div className="ai-panel-header">
        <h2>🤖 AI Analysis</h2>
        <div className="ai-meta">
          <span className="ai-model-tag">nemotron-120b · 2-turn reasoning</span>
          <span
            className="ai-badge"
            title={a && a._meta ? `Reasoning tokens used: ${a._meta.turn1_reasoning_tokens}` : undefined}
            style={{
              backgroundColor: aiLoading
                ? '#f59e0b'
                : aiError
                  ? '#ef4444'
                  : a
                    ? '#22c55e'
                    : '#334155',
            }}
          >
            {aiLoading ? 'Analyzing…' : aiError ? 'Error' : a ? 'Ready' : 'Waiting'}
          </span>
        </div>
      </div>

      {aiLoading && (
        <div className="ai-loading">
          <div className="ai-spinner" />
          <span>{loadingMsg}</span>
        </div>
      )}

      {aiError && !aiLoading && (
        <div className="ai-error-box">
          <strong>AI Error:</strong> {aiError}
          <div className="ai-error-hint">
            Make sure Ollama is running: <code>ollama serve</code> and model is pulled:{' '}
            <code>ollama pull gpt-oss:20b</code>
          </div>
        </div>
      )}

      {!aiLoading && !aiError && !a && (
        <div className="ai-placeholder">
          <p>No AI analysis generated yet.</p>
          <button className="ai-create-btn" onClick={onRefresh}>
            ✨ Create AI Analysis
          </button>
        </div>
      )}

      {!aiLoading && a && (
        <>
          <div className="ai-grid">
          {/* ── Market Intelligence ── */}
          <div className="ai-card ai-card-wide">
            <h3>Market Intelligence</h3>
            <div className="ai-summary-grid">
              <div className="ai-stat">
                <label>Primary Trend</label>
                <Tag value={a.summary?.primary_trend} />
              </div>
              <div className="ai-stat">
                <label>Momentum</label>
                <Tag value={a.summary?.momentum} />
              </div>
              <div className="ai-stat">
                <label>Phase</label>
                <Tag value={a.summary?.phase} />
              </div>
              <div className="ai-stat">
                <label>Regime</label>
                <Tag value={a.market_regime?.regime} />
              </div>
              <div className="ai-stat">
                <label>Bias</label>
                <Tag value={a.summary?.bias} />
              </div>
              <div className="ai-stat">
                <label>AI Confidence</label>
                <div className="ai-conf-wrap">
                  <div
                    className="ai-conf-bar"
                    style={{
                      width: `${a.summary?.confidence ?? 0}%`,
                      backgroundColor:
                        (a.summary?.confidence ?? 0) >= 70
                          ? '#22c55e'
                          : (a.summary?.confidence ?? 0) >= 40
                            ? '#f59e0b'
                            : '#ef4444',
                    }}
                  />
                  <span>{a.summary?.confidence ?? 0}%</span>
                </div>
              </div>
            </div>
            {a.summary?.reasoning && (
              <p className="ai-reasoning">{a.summary.reasoning}</p>
            )}
          </div>

          {/* ── Indicator Readings ── */}
          <div className="ai-card">
            <h3>Indicator Readings</h3>
            <Row label="RSI">
              <Tag value={a.indicators?.rsi?.state} />
            </Row>
            <Row label="RSI Divergence">
              <Tag value={a.indicators?.rsi?.divergence} />
            </Row>
            {a.indicators?.rsi?.signal && (
              <Row label="RSI Signal">
                <span className="ai-small-text">{a.indicators.rsi.signal}</span>
              </Row>
            )}
            <Row label="MACD">
              <Tag value={a.indicators?.macd?.state} />
            </Row>
            <Row label="EMA Alignment">
              <Tag value={a.indicators?.ema?.alignment} />
            </Row>
            <Row label="Price vs EMA20">
              <Tag value={a.indicators?.ema?.price_vs_ema20} />
            </Row>
            <Row label="Price vs EMA50">
              <Tag value={a.indicators?.ema?.price_vs_ema50} />
            </Row>
          </div>

          {/* ── Pivot Intelligence ── */}
          {a.pivot_analysis && (
            <div className="ai-card">
              <h3>Pivot Intelligence</h3>
              <Row label="PP Level">
                <span style={{ fontWeight: 700, color: '#e0e0e0' }}>
                  {a.pivot_analysis.pp ?? '—'}
                </span>
              </Row>
              <Row label="Price Zone">
                <Tag value={a.pivot_analysis.current_zone} />
              </Row>
              <Row label="Session Bias">
                <Tag value={a.pivot_analysis.session_bias} />
              </Row>
              <Row label="Pivot Target (Bull)">
                <span style={{ color: '#22c55e' }}>
                  {a.pivot_analysis.pivot_target_bull
                    ? `${a.pivot_analysis.pivot_target_bull.label} @ ${a.pivot_analysis.pivot_target_bull.value}`
                    : '—'}
                </span>
              </Row>
              <Row label="Pivot Target (Bear)">
                <span style={{ color: '#ef4444' }}>
                  {a.pivot_analysis.pivot_target_bear
                    ? `${a.pivot_analysis.pivot_target_bear.label} @ ${a.pivot_analysis.pivot_target_bear.value}`
                    : '—'}
                </span>
              </Row>
              {a.pivot_analysis.at_inflection_point && a.pivot_analysis.inflection_level && (
                <div className="pivot-proximity" style={{ marginTop: 10 }}>
                  ⚡ At inflection: <strong>{a.pivot_analysis.inflection_level}</strong>
                </div>
              )}
              {a.pivot_analysis.pivot_signal && (
                <p className="ai-reasoning" style={{ marginTop: 10 }}>
                  {a.pivot_analysis.pivot_signal}
                </p>
              )}
            </div>
          )}

          {/* ── Pivot Confluences ── */}
          {a.pivot_analysis?.confluences && (
            <div className="ai-card">
              <h3>Pivot Confluences</h3>
              {a.pivot_analysis.confluences.length > 0 ? (
                a.pivot_analysis.confluences.map((c, i) => (
                  <div key={i} className="ai-anomaly">
                    <Tag value={c.significance} />
                    <span className="ai-anomaly-type">{c.level} @ {c.price}</span>
                    <span className="ai-anomaly-desc">
                      Confluent with {c.confluent_with}
                    </span>
                  </div>
                ))
              ) : (
                <p className="ai-no-anomalies">No significant confluences detected.</p>
              )}
            </div>
          )}

          {/* ── Market Structure ── */}
          <div className="ai-card">
            <h3>Market Structure</h3>
            <Row label="Nearest Support">
              <span style={{ color: '#22c55e', fontWeight: 700 }}>
                {a.structure?.nearest_support ?? '—'}
              </span>
            </Row>
            <Row label="Nearest Resistance">
              <span style={{ color: '#ef4444', fontWeight: 700 }}>
                {a.structure?.nearest_resistance ?? '—'}
              </span>
            </Row>
            <Row label="Breakout Watch">
              <Tag value={a.structure?.breakout_watch} />
            </Row>
            <Row label="Range Bound">
              <Tag value={a.structure?.range_bound ? 'yes' : 'no'} />
            </Row>
            <Row label="Trend Strength">
              {a.market_regime?.trend_strength != null
                ? `${a.market_regime.trend_strength} / 100`
                : '—'}
            </Row>
            <Row label="Volatility">
              <Tag value={a.market_regime?.volatility} />
            </Row>
            <Row label="Is Trending">
              <Tag value={a.market_regime?.is_trending ? 'yes' : 'no'} />
            </Row>
          </div>

          {/* ── Trade Logic ── */}
          <div className="ai-card ai-card-wide">
            <h3>AI Trade Logic</h3>
            <div className="ai-scenarios">
              <div className="ai-scenario ai-scenario-bull">
                <label>🟢 Bullish Scenario</label>
                <p>{a.trade_logic?.bullish_scenario ?? '—'}</p>
                <small>
                  Invalidation:{' '}
                  <strong>{a.trade_logic?.invalidation_bull ?? '—'}</strong>
                </small>
              </div>
              <div className="ai-scenario ai-scenario-bear">
                <label>🔴 Bearish Scenario</label>
                <p>{a.trade_logic?.bearish_scenario ?? '—'}</p>
                <small>
                  Invalidation:{' '}
                  <strong>{a.trade_logic?.invalidation_bear ?? '—'}</strong>
                </small>
              </div>
            </div>
            {a.trade_logic?.suggested_bias && (
              <div className="ai-bias-row">
                <span>Suggested Bias:</span>
                <Tag value={a.trade_logic.suggested_bias} />
              </div>
            )}
            {a.trade_logic?.risk_note && (
              <div className="ai-risk-note">
                <label>⚠️ Risk Note</label>
                <p>{a.trade_logic.risk_note}</p>
              </div>
            )}
          </div>

          {/* ── Anomalies ── */}
          <div className="ai-card ai-card-wide">
            <h3>Anomalies &amp; Alerts</h3>
            {a.anomalies?.filter((x) => x.type !== 'none').length ? (
              a.anomalies
                .filter((x) => x.type !== 'none')
                .map((anom, i) => (
                  <div key={i} className="ai-anomaly">
                    <Tag value={anom.severity} />
                    <span className="ai-anomaly-type">{anom.type?.replace(/_/g, ' ')}</span>
                    <span className="ai-anomaly-desc">{anom.description}</span>
                  </div>
                ))
            ) : (
              <p className="ai-no-anomalies">No anomalies detected.</p>
            )}
          </div>

          {/* ── Order Flow ── */}
          {a.order_flow && (
            <div className="ai-card ai-card-wide">
              <h3>Order Flow</h3>
              <div className="ai-flow-grid">
                <Row label="OBI">{a.order_flow.obi ?? '—'}</Row>
                <Row label="TFI">{a.order_flow.tfi ?? '—'}</Row>
                <Row label="Dominant Side">
                  <Tag value={a.order_flow.dominant_side} />
                </Row>
              </div>
              {a.order_flow.interpretation && (
                <p className="ai-flow-interp">{a.order_flow.interpretation}</p>
              )}
            </div>
          )}
        </div>
        
        <div className="ai-footer-actions">
          <button className="ai-refresh-btn" onClick={onRefresh} disabled={aiLoading}>
            ↻ Generate New Analysis
          </button>
        </div>
        </>
      )}
    </div>
  )
}
