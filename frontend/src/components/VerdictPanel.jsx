import React, { useMemo, useState } from 'react';

/**
 * Decision-layer card rendered at the top of the AI tab.
 *
 * TAKE / SKIP / WAIT with EV, break-even hit rate, blocking guardrails (with explicit Override),
 * a bull/bear factor ledger, scenario tree, and the management plan. Numbers come from the
 * server — this component never invents an EV or a guardrail.
 */

const VERDICT_TONE = {
  TAKE: 'bull',
  SKIP: 'bear',
  WAIT: 'flat',
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

  const tone = VERDICT_TONE[displayedVerdict] ?? VERDICT_TONE.WAIT;

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
    <div className="panel-card" id="verdict-panel">
      <div className="panel-card-header">
        <span className="panel-title">Verdict</span>
      </div>

      <div className={`verdict-banner verdict-banner--${tone}`}>
        <span className="verdict-banner__bias">{displayedVerdict}</span>
      </div>

      <div className="panel-section">
        <div className="stack-2">
          <div className="row-between">
            <span title="Expected value in R-multiples after fees">Expected value</span>
            <span className={expectancy.ev_r > 0 ? 'bull' : expectancy.ev_r < 0 ? 'bear' : ''}>
              {formatR(expectancy.ev_r)}
            </span>
          </div>
          <div className="row-between">
            <span title="Hit rate this plan needs just to break even given its R:R and fees">Break-even hit rate</span>
            <span>{pct(expectancy.breakeven_hit_rate)}</span>
          </div>
          <div className="row-between">
            <span title="Calibrated hit rate from scored past predictions of this setup × regime">
              Calibrated hit rate
            </span>
            <span className={(expectancy.n ?? 0) < 20 ? 'low-confidence' : ''}>
              {pct(expectancy.p)}
              {expectancy.n != null ? ` (n=${expectancy.n})` : ''}
              {expectancy.p_ci_low != null && expectancy.p_ci_high != null
                ? ` · CI ${pct(expectancy.p_ci_low)}–${pct(expectancy.p_ci_high)}`
                : ''}
            </span>
          </div>
          {expectancy.reward_r != null && (
            <div className="row-between">
              <span>Nearest target R:R</span>
              <span>{expectancy.reward_r.toFixed(2)}:1</span>
            </div>
          )}
        </div>

        {expectancy.summary && (
          <p className="ai-signal-note mt-2">{expectancy.summary}</p>
        )}
      </div>

      {guardrails.length > 0 && (
        <div className="panel-section">
          <div className="panel-section__title">Guardrails</div>
          <div className="stack-2">
            {guardrails.map((g) => {
              const isOverridden = overridden.has(g.id);
              return (
                <div key={g.id} className={`guardrail-item ${isOverridden ? 'guardrail-item--overridden' : ''}`}>
                  <div className="guardrail-item__body">
                    <div className="guardrail-item__title">
                      {g.id.replace(/_/g, ' ').toUpperCase()}
                      {isOverridden ? ' — overridden' : ''}
                    </div>
                    <div className="guardrail-item__reason">{g.reason}</div>
                  </div>
                  {g.overridable && !isOverridden && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleOverride(g.id)}
                      title="Override requires an explicit click and is logged"
                    >
                      Override
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {activeGuards.length === 0 && overridden.size > 0 && (
            <p className="ai-signal-note mt-2">
              {displayedVerdict === 'TAKE'
                ? 'All blocking guardrails overridden — verdict is TAKE. Proceed with eyes open.'
                : 'All blocking guardrails overridden — proceed with eyes open.'}
            </p>
          )}
        </div>
      )}

      {(bullFactors.length > 0 || bearFactors.length > 0) && (
        <div className="panel-section">
          <div className="ai-plan-grid">
            <div>
              <div className="summary-label bull mb-1">Bull factors</div>
              {bullFactors.length === 0 && <span className="text-sm-muted">None</span>}
              {bullFactors.map((f, i) => (
                <div key={`b-${i}`} className="factor-line">
                  <span className="factor-line__weight">{f.weight.toFixed(1)}×</span> {f.label}
                </div>
              ))}
            </div>
            <div>
              <div className="summary-label bear mb-1">Bear factors</div>
              {bearFactors.length === 0 && <span className="text-sm-muted">None</span>}
              {bearFactors.map((f, i) => (
                <div key={`r-${i}`} className="factor-line">
                  <span className="factor-line__weight">{f.weight.toFixed(1)}×</span> {f.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="panel-section__title">Scenario tree</div>
        <div className="stack-2">
          <div className="row-between"><span>Primary</span><span className="text-right">{scenarios.primary || '—'}</span></div>
          <div className="row-between"><span>Alternate</span><span className="text-right">{scenarios.alternate || '—'}</span></div>
          <div className="row-between"><span>Invalidation</span><span className="text-right">{scenarios.invalidation || '—'}</span></div>
        </div>
      </div>

      {management.summary && (
        <div className="panel-section">
          <div className="panel-section__title">Management plan</div>
          <p className="ai-signal-note">{management.summary}</p>
          {management.breakeven?.rule && (
            <div className="row-between mt-1">
              <span>Breakeven</span>
              <span className="text-right">{management.breakeven.rule}</span>
            </div>
          )}
          {management.trail?.rule && (
            <div className="row-between">
              <span>Trail</span>
              <span className="text-right">{management.trail.rule}</span>
            </div>
          )}
          {management.partials?.length > 0 && (
            <div className="row-between">
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
