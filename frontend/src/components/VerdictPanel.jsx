import React, { useMemo, useState } from 'react';

/**
 * Decision-layer card rendered at the top of the AI tab.
 *
 * TAKE / SKIP / WAIT with EV, break-even hit rate, blocking guardrails (with explicit Override),
 * a bull/bear factor ledger, scenario tree, and the management plan. Numbers come from the
 * server — this component never invents an EV or a guardrail.
 */

const VERDICT_STYLES = {
  TAKE: { color: 'var(--bull)', bg: 'var(--bull-soft)', label: 'TAKE' },
  SKIP: { color: 'var(--bear)', bg: 'var(--bear-soft)', label: 'SKIP' },
  WAIT: { color: 'var(--neutral)', bg: 'var(--neutral-soft)', label: 'WAIT' },
};

function pct(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatR(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}R`;
}

/** Mirror applyGuardrailVerdict: negative EV stays SKIP; WAIT-from-guardrails flips to TAKE only when every blocking gate is overridden and expectancy was TAKE. */
function resolveDisplayedVerdict(expectancyVerdict, guardrails, overriddenIds) {
  const active = (guardrails ?? []).filter((g) => g.blocked && !overriddenIds.has(g.id));
  if (expectancyVerdict === 'WAIT') return 'WAIT';
  if (expectancyVerdict === 'SKIP') return 'SKIP';
  if (active.length) return 'WAIT';
  return 'TAKE';
}

export default function VerdictPanel({ analysis, onOverride }) {
  const verdict = analysis?.verdict;
  const [overridden, setOverridden] = useState(() => new Set());

  const expectancy = verdict?.expectancy ?? {};
  const management = verdict?.management ?? analysis?.management ?? {};
  const guardrails = (verdict?.guardrails ?? []).filter((g) => g.blocked);
  const factors = verdict?.factors ?? [];
  const bullFactors = factors.filter((f) => f.side === 'bull');
  const bearFactors = factors.filter((f) => f.side === 'bear');
  const scenarios = verdict?.scenarios ?? {};

  const displayedVerdict = useMemo(() => {
    if (!verdict) return 'WAIT';
    const expectancyVerdict = expectancy.verdict ?? verdict.verdict ?? 'WAIT';
    return resolveDisplayedVerdict(expectancyVerdict, guardrails, overridden);
  }, [verdict, expectancy.verdict, guardrails, overridden]);

  if (!verdict) return null;

  const style = VERDICT_STYLES[displayedVerdict] ?? VERDICT_STYLES.WAIT;

  const handleOverride = (id) => {
    setOverridden((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    onOverride?.(id);
  };

  const activeGuards = guardrails.filter((g) => !overridden.has(g.id));

  return (
    <div className="panel-card" id="verdict-panel" style={{ marginBottom: '16px' }}>
      <div className="panel-card-header" style={{ alignItems: 'center' }}>
        <span className="panel-title">Verdict</span>
        <span
          className="panel-badge"
          style={{
            backgroundColor: style.bg,
            color: style.color,
            fontWeight: 700,
            letterSpacing: '0.06em',
            fontSize: '13px',
            padding: '4px 12px',
          }}
        >
          {style.label}
        </span>
      </div>

      <div className="ai-rows">
        <div className="ai-row">
          <span title="Expected value in R-multiples after fees">Expected value</span>
          <span style={{ color: expectancy.ev_r > 0 ? 'var(--bull)' : expectancy.ev_r < 0 ? 'var(--bear)' : 'inherit' }}>
            {formatR(expectancy.ev_r)}
          </span>
        </div>
        <div className="ai-row">
          <span title="Hit rate this plan needs just to break even given its R:R and fees">Break-even hit rate</span>
          <span>{pct(expectancy.breakeven_hit_rate)}</span>
        </div>
        <div className="ai-row">
          <span title="Calibrated hit rate from scored past predictions of this setup × regime">
            Calibrated hit rate
          </span>
          <span style={{ opacity: (expectancy.n ?? 0) < 20 ? 0.45 : 1 }}>
            {pct(expectancy.p)}
            {expectancy.n != null ? ` (n=${expectancy.n})` : ''}
            {expectancy.p_ci_low != null && expectancy.p_ci_high != null
              ? ` · CI ${pct(expectancy.p_ci_low)}–${pct(expectancy.p_ci_high)}`
              : ''}
          </span>
        </div>
        {expectancy.reward_r != null && (
          <div className="ai-row">
            <span>Nearest target R:R</span>
            <span>{expectancy.reward_r.toFixed(2)}:1</span>
          </div>
        )}
      </div>

      {expectancy.summary && (
        <p className="ai-signal-note" style={{ marginTop: '8px' }}>{expectancy.summary}</p>
      )}

      {guardrails.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <div className="summary-label" style={{ marginBottom: '6px' }}>Guardrails</div>
          {guardrails.map((g) => {
            const isOverridden = overridden.has(g.id);
            return (
              <div
                key={g.id}
                className="ai-row"
                style={{
                  background: isOverridden ? 'transparent' : 'var(--bear-soft)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  marginBottom: '4px',
                  opacity: isOverridden ? 0.55 : 1,
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: isOverridden ? 'var(--text-muted)' : 'var(--bear)', fontSize: '12px' }}>
                    {g.id.replace(/_/g, ' ').toUpperCase()}
                    {isOverridden ? ' — overridden' : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.reason}</div>
                </div>
                {g.overridable && !isOverridden && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                    onClick={() => handleOverride(g.id)}
                    title="Override requires an explicit click and is logged"
                  >
                    Override
                  </button>
                )}
              </div>
            );
          })}
          {activeGuards.length === 0 && overridden.size > 0 && (
            <p className="ai-signal-note">
              {displayedVerdict === 'TAKE'
                ? 'All blocking guardrails overridden — verdict is TAKE. Proceed with eyes open.'
                : 'All blocking guardrails overridden — proceed with eyes open.'}
            </p>
          )}
        </div>
      )}

      {(bullFactors.length > 0 || bearFactors.length > 0) && (
        <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div className="summary-label" style={{ color: 'var(--bull)', marginBottom: '4px' }}>Bull factors</div>
            {bullFactors.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None</span>}
            {bullFactors.map((f, i) => (
              <div key={`b-${i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                <span style={{ opacity: 0.6 }}>{f.weight.toFixed(1)}×</span> {f.label}
              </div>
            ))}
          </div>
          <div>
            <div className="summary-label" style={{ color: 'var(--bear)', marginBottom: '4px' }}>Bear factors</div>
            {bearFactors.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None</span>}
            {bearFactors.map((f, i) => (
              <div key={`r-${i}`} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                <span style={{ opacity: 0.6 }}>{f.weight.toFixed(1)}×</span> {f.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '14px' }}>
        <div className="summary-label" style={{ marginBottom: '4px' }}>Scenario tree</div>
        <div className="ai-rows">
          <div className="ai-row"><span>Primary</span><span style={{ textAlign: 'right', maxWidth: '65%' }}>{scenarios.primary || '—'}</span></div>
          <div className="ai-row"><span>Alternate</span><span style={{ textAlign: 'right', maxWidth: '65%' }}>{scenarios.alternate || '—'}</span></div>
          <div className="ai-row"><span>Invalidation</span><span style={{ textAlign: 'right', maxWidth: '65%' }}>{scenarios.invalidation || '—'}</span></div>
        </div>
      </div>

      {management.summary && (
        <div style={{ marginTop: '14px' }}>
          <div className="summary-label" style={{ marginBottom: '4px' }}>Management plan</div>
          <p className="ai-signal-note" style={{ margin: 0 }}>{management.summary}</p>
          {management.breakeven?.rule && (
            <div className="ai-row" style={{ marginTop: '4px' }}>
              <span>Breakeven</span>
              <span style={{ textAlign: 'right', maxWidth: '65%' }}>{management.breakeven.rule}</span>
            </div>
          )}
          {management.trail?.rule && (
            <div className="ai-row">
              <span>Trail</span>
              <span style={{ textAlign: 'right', maxWidth: '65%' }}>{management.trail.rule}</span>
            </div>
          )}
          {management.partials?.length > 0 && (
            <div className="ai-row">
              <span>Partials</span>
              <span>
                {management.partials.map((p) => `${Math.round(p.fraction * 100)}% @ ${p.at}`).join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
