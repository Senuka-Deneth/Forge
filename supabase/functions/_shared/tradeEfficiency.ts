/**
 * Stop and target diagnostics from excursion data — "are my brackets the right width?"
 *
 * Forge already records MAE and MFE on every scored plan and then does almost nothing with them.
 * That is a waste of the most diagnostic data the system collects: entry quality, stop placement,
 * and target realism each leave a distinct fingerprint in the excursions, and none of them are
 * visible in a hit rate.
 *
 * **Excursions are stored in absolute price units.** Averaging them directly across symbols — as
 * a raw mean of a BTC trade at $60,000 and an alt at $0.30 — produces a number with no meaning,
 * dominated entirely by whichever symbol has the larger nominal price. Everything here converts to
 * R first, using each trade's own |entry − stop|, which is the only unit in which a BTC trade and
 * an alt trade are commensurable.
 *
 * ## The survivorship trap
 *
 * The headline finding of MAE analysis is always the same: "your winners barely went against you,
 * so tighten the stop". It is also the most expensive mistake in this entire file, because the
 * winner set is conditioned on the stop that was actually used. Trades that dipped past a tighter
 * stop and then recovered into winners are in that set precisely *because* the stop was wide. Move
 * the stop in and some of those winners become losses — and the ones you lose are not random, they
 * are the ones with the largest MAE, which skew toward the biggest R.
 *
 * So `suggested_stop_r` is framed throughout as a hypothesis for the backtest CLI to test, never
 * as an instruction. The honest version of this tool tells you where to look, not what to do.
 */

export type ExcursionRecord = {
  /** Maximum adverse excursion in price units (as `outcome.ts` records it). */
  mae: number | null;
  /** Maximum favourable excursion in price units. */
  mfe: number | null;
  entry: number | null;
  stop: number | null;
  realized_r: number | null;
  outcome: string | null;
};

export type NormalizedExcursion = {
  mae_r: number;
  mfe_r: number;
  realized_r: number | null;
  outcome: string;
  won: boolean;
};

export type Percentiles = {
  p50: number;
  p75: number;
  p90: number;
  max: number;
};

export type EfficiencyReport = {
  n: number;
  n_winners: number;
  n_losers: number;
  /** MAE percentiles across winning trades — how much heat a winner actually takes. */
  winner_mae_r: Percentiles | null;
  /** MFE percentiles across losing trades — how far a loser ran before dying. */
  loser_mfe_r: Percentiles | null;
  winner_mfe_r: Percentiles | null;
  /** Stop width that would have survived 90% of past winners, plus a buffer. */
  suggested_stop_r: number | null;
  stop_verdict: "too_wide" | "being_run" | "about_right" | "insufficient_data";
  stop_note: string;
  /** Share of stopped-out trades that had already run 1R in your favour first. */
  shakeout_rate: number | null;
  /** Median MFE of losers — a candidate breakeven trigger. */
  breakeven_trigger_r: number | null;
  /** mean(realized R) / mean(MFE R) on winners: the share of the available move captured. */
  capture_efficiency: number | null;
  target_verdict: "leaving_money" | "overreaching" | "about_right" | "insufficient_data";
  target_note: string;
  summary: string;
};

/** Below this many decided trades the percentiles are noise and every verdict is withheld. */
export const MIN_SAMPLE = 20;

/** A loser that had already run this far in your favour was a trade you were shaken out of. */
const SHAKEOUT_R = 1.0;

function percentileOf(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function summarize(values: number[]): Percentiles | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    p50: Number(percentileOf(sorted, 0.5).toFixed(3)),
    p75: Number(percentileOf(sorted, 0.75).toFixed(3)),
    p90: Number(percentileOf(sorted, 0.9).toFixed(3)),
    max: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

function mean(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (!usable.length) return null;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

/**
 * Strict numeric coercion.
 *
 * `Number(null)` is 0 and passes `Number.isFinite`, which matters more here than almost anywhere
 * else in the codebase: 0 is a *legitimate* excursion value, so a null MAE silently becomes
 * "this trade never went against you" and drags the whole stop diagnosis toward "too wide".
 * An unscored row must be dropped, not counted as a perfect entry.
 */
function strictNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert price-unit excursions into R using each trade's own risk.
 *
 * Records without a usable entry, stop, or excursion pair are dropped rather than defaulted —
 * a trade whose risk cannot be reconstructed contributes nothing but noise.
 */
export function normalizeExcursions(records: ExcursionRecord[]): NormalizedExcursion[] {
  const out: NormalizedExcursion[] = [];
  for (const record of records ?? []) {
    const entry = strictNumber(record?.entry);
    const stop = strictNumber(record?.stop);
    const mae = strictNumber(record?.mae);
    const mfe = strictNumber(record?.mfe);
    if (entry == null || stop == null || entry <= 0 || stop <= 0) continue;
    if (mae == null || mfe == null) continue;

    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) continue;

    const outcome = String(record.outcome ?? "");
    // `no_fill` never had a position, so its excursions describe a trade that did not happen.
    if (outcome === "no_fill" || outcome === "pending" || outcome === "invalid") continue;

    const realizedR = strictNumber(record.realized_r);
    out.push({
      mae_r: Math.abs(mae) / risk,
      mfe_r: Math.abs(mfe) / risk,
      realized_r: realizedR,
      outcome,
      // Prefer realized R over the outcome label: a laddered plan can end `target_hit` with a
      // negative R when only the first partial filled before the stop.
      won: realizedR != null ? realizedR > 0 : outcome === "target_hit",
    });
  }
  return out;
}

/**
 * Build the stop and target diagnosis.
 *
 * Every verdict is gated on `MIN_SAMPLE` decided trades — the same bar the calibration layer uses
 * before it trusts a hit rate. Percentiles from twelve trades are a story, not a statistic.
 */
export function analyzeTradeEfficiency(
  records: ExcursionRecord[],
  opts: { minSample?: number; stopBufferR?: number } = {},
): EfficiencyReport {
  const minSample = Number.isFinite(Number(opts.minSample)) ? Number(opts.minSample) : MIN_SAMPLE;
  // Buffer over the observed p90 so the suggestion is not fitted to the exact worst survivor.
  const buffer = Number.isFinite(Number(opts.stopBufferR)) ? Number(opts.stopBufferR) : 0.15;

  const normalized = normalizeExcursions(records);
  const winners = normalized.filter((r) => r.won);
  const losers = normalized.filter((r) => !r.won);

  const winnerMae = summarize(winners.map((r) => r.mae_r));
  const winnerMfe = summarize(winners.map((r) => r.mfe_r));
  const loserMfe = summarize(losers.map((r) => r.mfe_r));

  const insufficient: EfficiencyReport = {
    n: normalized.length,
    n_winners: winners.length,
    n_losers: losers.length,
    winner_mae_r: winnerMae,
    loser_mfe_r: loserMfe,
    winner_mfe_r: winnerMfe,
    suggested_stop_r: null,
    stop_verdict: "insufficient_data",
    stop_note: `Needs ${minSample} decided trades with excursion data before stop width can be judged — currently ${normalized.length}.`,
    shakeout_rate: null,
    breakeven_trigger_r: null,
    capture_efficiency: null,
    target_verdict: "insufficient_data",
    target_note: `Needs ${minSample} decided trades before target placement can be judged — currently ${normalized.length}.`,
    summary: `${normalized.length} scored trades with usable excursions. Diagnosis unlocks at ${minSample}.`,
  };

  if (normalized.length < minSample) return insufficient;

  // --- Stop diagnosis -----------------------------------------------------
  let suggestedStop: number | null = null;
  let stopVerdict: EfficiencyReport["stop_verdict"] = "about_right";
  let stopNote = "";

  const shakeouts = losers.filter((r) => r.mfe_r >= SHAKEOUT_R).length;
  const shakeoutRate = losers.length ? shakeouts / losers.length : null;

  if (winnerMae && winners.length >= 8) {
    suggestedStop = Number(Math.min(1, winnerMae.p90 + buffer).toFixed(3));
    if (winnerMae.p90 + buffer < 0.75) {
      stopVerdict = "too_wide";
      stopNote =
        `90% of winners never ran more than ${winnerMae.p90.toFixed(2)}R against you, so a stop at ~${suggestedStop.toFixed(2)}R would have survived nearly all of them — and every winner would score roughly ${(1 / suggestedStop).toFixed(1)}× the R on the same price move. Treat this as a backtest hypothesis, not a change: the winners you are measuring are the ones the current stop let breathe, and a tighter stop turns some of them into losses.`;
    } else {
      stopNote =
        `Winners take ${winnerMae.p50.toFixed(2)}R of heat at the median and ${winnerMae.p90.toFixed(2)}R at the 90th percentile — the stop is close to the width the trades actually need.`;
    }
  } else {
    stopNote = `Only ${winners.length} winners with excursion data — not enough to judge stop width.`;
  }

  // Being run matters more than being wide: if a third of the losers were already 1R onside, the
  // problem is not the entry, it is that nothing protected an open profit.
  if (shakeoutRate != null && shakeoutRate > 0.35 && losers.length >= 8) {
    stopVerdict = "being_run";
    stopNote =
      `${(shakeoutRate * 100).toFixed(0)}% of losing trades were already ${SHAKEOUT_R}R in profit before they stopped out. That is not a stop-width problem, it is an open-profit problem — a breakeven trigger around ${loserMfe ? loserMfe.p50.toFixed(2) : "1.0"}R would have salvaged half of them.`;
  }

  // --- Target diagnosis ---------------------------------------------------
  const winnerRealized = mean(winners.map((r) => r.realized_r ?? Number.NaN));
  const winnerPeak = mean(winners.map((r) => r.mfe_r));
  const capture = winnerRealized != null && winnerPeak != null && winnerPeak > 0
    ? winnerRealized / winnerPeak
    : null;

  let targetVerdict: EfficiencyReport["target_verdict"] = "about_right";
  let targetNote = "";

  if (capture == null || winners.length < 8) {
    targetVerdict = "insufficient_data";
    targetNote = `Only ${winners.length} winners with excursion data — not enough to judge target placement.`;
  } else if (capture < 0.5) {
    targetVerdict = "leaving_money";
    targetNote =
      `Winners peak at ${winnerPeak!.toFixed(2)}R on average but book ${winnerRealized!.toFixed(2)}R — you capture ${(capture * 100).toFixed(0)}% of the move you correctly called. The targets are in front of where price actually goes; a trailing runner would collect the rest.`;
  } else if (capture > 0.9 && loserMfe && loserMfe.p50 > 1) {
    targetVerdict = "overreaching";
    targetNote =
      `Winners capture ${(capture * 100).toFixed(0)}% of their peak, but losers still reached ${loserMfe.p50.toFixed(2)}R before failing — targets are sitting just beyond where these moves exhaust.`;
  } else {
    targetNote =
      `Winners capture ${(capture * 100).toFixed(0)}% of their peak excursion — targets are roughly where the moves end.`;
  }

  const headline = stopVerdict === "being_run"
    ? "Open profits are not being protected."
    : stopVerdict === "too_wide"
    ? "Stops are wider than the trades need."
    : targetVerdict === "leaving_money"
    ? "Targets are closer than the moves run."
    : "Brackets are broadly matched to the trades.";

  return {
    n: normalized.length,
    n_winners: winners.length,
    n_losers: losers.length,
    winner_mae_r: winnerMae,
    loser_mfe_r: loserMfe,
    winner_mfe_r: winnerMfe,
    suggested_stop_r: suggestedStop,
    stop_verdict: stopVerdict,
    stop_note: stopNote,
    shakeout_rate: shakeoutRate != null ? Number(shakeoutRate.toFixed(4)) : null,
    breakeven_trigger_r: loserMfe ? loserMfe.p50 : null,
    capture_efficiency: capture != null ? Number(capture.toFixed(4)) : null,
    target_verdict: targetVerdict,
    target_note: targetNote,
    summary: `${headline} (${normalized.length} scored trades: ${winners.length} winners, ${losers.length} losers.)`,
  };
}
