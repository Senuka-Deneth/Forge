/**
 * Position sizing — the step between "this is a good setup" and "this is how much I buy".
 *
 * Forge computes EV in R-multiples everywhere, which is the right unit for *comparing* setups and
 * the wrong unit for *placing* an order. R only becomes real once a quantity exists: 1R is whatever
 * you decided to lose, and every calibration number downstream is a lie if the size that produced
 * it was typed in by hand.
 *
 * Three things this module refuses to do, because each is a way traders quietly blow up:
 *
 * 1. **Round quantity up.** Every rounding here floors toward a smaller position. Rounding to the
 *    nearest lot silently pushes you over the risk budget you just chose.
 * 2. **Ignore fees.** The risk of a trade is the stop distance *plus* the round trip. On a tight
 *    stop the fees are a material fraction of 1R, and pretending otherwise inflates every R you
 *    ever record.
 * 3. **Ignore liquidation.** A leveraged stop that sits beyond the liquidation price is not a stop.
 *    The exchange closes you first, at a worse price, and the "1R loss" in your journal is fiction.
 *
 * Everything is pure: no network, no Deno globals. The frontend imports the same functions through
 * the `@forge/position-sizing` alias so the sizer preview and the server agree by construction.
 */

import { ROUND_TRIP_COST } from "./outcome.ts";

export type OrderSide = "long" | "short";

/**
 * Exchange trading rules for one symbol, normalized out of Binance `exchangeInfo` filters.
 *
 * Null means "the exchange did not tell us", which is treated as unconstrained rather than as
 * zero — an unknown `minNotional` must not block an order.
 */
export type SymbolFilters = {
  /** PRICE_FILTER.tickSize — price granularity. */
  tickSize: number | null;
  /** LOT_SIZE.stepSize — quantity granularity. */
  stepSize: number | null;
  /** LOT_SIZE.minQty. */
  minQty: number | null;
  /** LOT_SIZE.maxQty. */
  maxQty: number | null;
  /** NOTIONAL.minNotional (MIN_NOTIONAL on older payloads). */
  minNotional: number | null;
};

export const UNCONSTRAINED_FILTERS: SymbolFilters = {
  tickSize: null,
  stepSize: null,
  minQty: null,
  maxQty: null,
  minNotional: null,
};

/**
 * Binance USD-M perpetual maintenance margin rate at the lowest (largest-notional-allowed) tier.
 *
 * Real maintenance margin is tiered by notional and differs per symbol. 0.4% is the majors' first
 * tier and is the *most forgiving* value, so a liquidation estimate built from it sits slightly
 * further from entry than reality. That direction is deliberate: an optimistic liquidation price
 * makes the "your stop is past liquidation" warning fire later, never spuriously.
 */
export const DEFAULT_MAINTENANCE_MARGIN_RATE = 0.004;

export type PositionSizeInput = {
  /** Account equity in quote currency (USDT). */
  equity: number;
  /** Percent of equity to risk on this trade — 1 means 1%, not 0.01. */
  riskPct: number;
  entry: number;
  stop: number;
  side: OrderSide;
  filters?: SymbolFilters | null;
  /** One-way taker fee as a fraction. Defaults to half the shared round-trip constant. */
  feeRate?: number;
  /** Hard leverage ceiling for the account. 1 means spot / no leverage. */
  maxLeverage?: number;
  /**
   * Leverage actually selected on the exchange, which is *not* the same as the leverage this
   * position requires.
   *
   * Required leverage (notional / equity) assumes the whole account backs the position. Selected
   * leverage decides how much margin is actually posted to an isolated position — and therefore
   * where liquidation sits. A trader who needs 3× but leaves the symbol set to 50× posts a
   * sixteenth of the margin and liquidates sixteen times closer to entry. Omit this and the
   * position is treated as fully backed by the account.
   */
  selectedLeverage?: number;
  maintenanceMarginRate?: number;
};

export type PositionSizeResult = {
  /** Base-asset quantity, floored to the exchange step. */
  qty: number;
  /** Position value in quote currency at entry. */
  notional: number;
  /** Quote currency actually at risk if the stop fills, including the round trip. */
  risk_amount: number;
  /** What `risk_amount` works out to as a percent of equity, after all rounding. */
  risk_pct_actual: number;
  /** Quote-currency risk budget before rounding — what the trader asked for. */
  risk_budget: number;
  stop_distance: number;
  stop_distance_pct: number;
  /** notional / equity. Below 1 means the position fits inside the account unlevered. */
  required_leverage: number;
  /** The leverage the liquidation estimate was computed at (selected, or required when unset). */
  effective_leverage: number;
  /** Isolated-margin liquidation estimate, null when the position needs no leverage. */
  liquidation_price: number | null;
  /** Distance from entry to liquidation as a percent of entry. Null when unlevered. */
  liquidation_distance_pct: number | null;
  /** True when the exchange would close the position before the stop is reached. */
  liquidation_before_stop: boolean;
  /** Round-trip fee in quote currency. */
  fee_cost: number;
  /** Round-trip fee expressed in R — the same figure `expectancy.cost_r` subtracts from EV. */
  fee_cost_r: number;
  /** Order is placeable: positive size that clears every exchange minimum. */
  tradeable: boolean;
  warnings: string[];
};

function finite(value: unknown): number | null {
  // `Number(null)` is 0, so an unguarded coercion would read a missing CI bound as a 0% hit rate
  // and a missing filter as a zero step. Reject the empty cases before coercing.
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decimal places implied by an exchange step like 0.001 or 1e-7.
 *
 * Needed because `Math.floor(q / 0.001) * 0.001` reintroduces binary-float noise (0.30000000000000004),
 * and an order quantity with 17 significant digits is rejected by the exchange.
 */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 8;
  const text = String(step);
  const exponent = text.match(/e-(\d+)$/i);
  if (exponent) {
    const mantissaDecimals = text.split("e")[0].split(".")[1]?.length ?? 0;
    return Number(exponent[1]) + mantissaDecimals;
  }
  const decimals = text.split(".")[1]?.length ?? 0;
  return Math.min(decimals, 12);
}

/**
 * Floor `value` onto the `step` lattice.
 *
 * Always down. A quantity rounded up breaches the risk budget the trader just set, which is the
 * one number in this module that must never be exceeded by a rounding convenience.
 */
export function roundDownToStep(value: number, step: number | null | undefined): number {
  const s = finite(step);
  if (s == null || s <= 0) return value;
  if (!Number.isFinite(value)) return 0;
  // 1e-9 relative slack absorbs float error so a value that is exactly on the lattice
  // (12.3 / 0.1 = 122.99999999999999) does not drop a whole step.
  const steps = Math.floor(value / s + 1e-9);
  return Number((steps * s).toFixed(decimalsForStep(s)));
}

/** Round a price to the exchange tick. Prices round to nearest — only *quantity* must floor. */
export function roundToTick(value: number, tick: number | null | undefined): number {
  const t = finite(tick);
  if (t == null || t <= 0) return value;
  if (!Number.isFinite(value)) return value;
  return Number((Math.round(value / t) * t).toFixed(decimalsForStep(t)));
}

/**
 * Isolated-margin liquidation price for a linear (USDT-settled) perpetual.
 *
 * Derived rather than memorized. With quantity Q, entry E, leverage L, the isolated initial margin
 * is Q·E/L. Liquidation is the price where remaining margin equals the maintenance requirement:
 *
 *   long:   Q·E/L − Q·(E − P) = m·Q·P   →   P = E·(1 − 1/L) / (1 − m)
 *   short:  Q·E/L − Q·(P − E) = m·Q·P   →   P = E·(1 + 1/L) / (1 + m)
 *
 * Q cancels, so this depends only on entry, leverage and the maintenance rate. It ignores funding
 * already paid and any extra margin added after entry, both of which push liquidation further away —
 * so the estimate is conservative for a long and for a short alike.
 */
export function liquidationPrice(
  entry: number,
  leverage: number,
  side: OrderSide,
  maintenanceMarginRate = DEFAULT_MAINTENANCE_MARGIN_RATE,
): number | null {
  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(leverage) || leverage <= 0) return null;
  const m = Number.isFinite(maintenanceMarginRate) ? maintenanceMarginRate : DEFAULT_MAINTENANCE_MARGIN_RATE;
  if (side === "long") {
    const price = (entry * (1 - 1 / leverage)) / (1 - m);
    return price > 0 ? price : 0;
  }
  return (entry * (1 + 1 / leverage)) / (1 + m);
}

/**
 * Size a position from an account risk budget.
 *
 * The core identity is `qty = risk_budget / stop_distance`, with three corrections applied in order:
 * fees eat into the budget, the leverage cap can force a smaller position than the stop implies,
 * and the exchange lot step floors whatever survives.
 */
export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const warnings: string[] = [];
  const filters = input.filters ?? UNCONSTRAINED_FILTERS;
  const feeRate = finite(input.feeRate) ?? ROUND_TRIP_COST / 2;
  const maxLeverage = finite(input.maxLeverage) ?? 1;
  const mmr = finite(input.maintenanceMarginRate) ?? DEFAULT_MAINTENANCE_MARGIN_RATE;

  const equity = finite(input.equity) ?? 0;
  const riskPct = finite(input.riskPct) ?? 0;
  const entry = finite(input.entry);
  const stop = finite(input.stop);

  const empty: PositionSizeResult = {
    qty: 0,
    notional: 0,
    risk_amount: 0,
    risk_pct_actual: 0,
    risk_budget: 0,
    stop_distance: 0,
    stop_distance_pct: 0,
    required_leverage: 0,
    effective_leverage: 0,
    liquidation_price: null,
    liquidation_distance_pct: null,
    liquidation_before_stop: false,
    fee_cost: 0,
    fee_cost_r: 0,
    tradeable: false,
    warnings,
  };

  if (equity <= 0) {
    warnings.push("Account equity must be greater than zero.");
    return empty;
  }
  if (riskPct <= 0) {
    warnings.push("Risk per trade must be greater than zero.");
    return empty;
  }
  if (entry == null || entry <= 0 || stop == null || stop <= 0) {
    warnings.push("Entry and stop must both be positive prices.");
    return empty;
  }

  // A stop on the wrong side of entry is not a wide stop, it is a different trade. Refuse rather
  // than silently sizing off |entry − stop| and handing back a position that is already past its
  // own invalidation.
  if (input.side === "long" && stop >= entry) {
    warnings.push("Long stop must sit below entry.");
    return empty;
  }
  if (input.side === "short" && stop <= entry) {
    warnings.push("Short stop must sit above entry.");
    return empty;
  }

  const stopDistance = Math.abs(entry - stop);
  const stopDistancePct = (stopDistance / entry) * 100;
  const riskBudget = equity * (riskPct / 100);

  // Fees are paid on notional at both ends, so each unit risks (stopDistance + fees per unit).
  // Solving qty·stopDistance + qty·entry·2·feeRate = riskBudget keeps the *total* loss on the
  // risk budget rather than the price move alone.
  const perUnitFee = entry * feeRate * 2;
  const perUnitRisk = stopDistance + perUnitFee;
  if (perUnitRisk <= 0) {
    warnings.push("Stop distance is zero — cannot size a position.");
    return empty;
  }

  let qty = riskBudget / perUnitRisk;

  // Leverage ceiling. A stop this tight may allow a position the account cannot carry; the cap
  // wins and the trade simply risks less than requested.
  const maxNotional = equity * maxLeverage;
  if (qty * entry > maxNotional) {
    qty = maxNotional / entry;
    warnings.push(
      `Position capped by ${maxLeverage}× leverage limit — risking less than the requested ${riskPct}%.`,
    );
  }

  if (filters.maxQty != null && qty > filters.maxQty) {
    qty = filters.maxQty;
    warnings.push(`Quantity capped at exchange maxQty ${filters.maxQty}.`);
  }

  qty = roundDownToStep(qty, filters.stepSize);

  if (qty <= 0) {
    warnings.push("Risk budget is too small for one lot at this stop distance.");
    return { ...empty, stop_distance: stopDistance, stop_distance_pct: stopDistancePct, risk_budget: riskBudget };
  }

  const notional = qty * entry;
  const feeCost = notional * feeRate * 2;
  const riskAmount = qty * stopDistance + feeCost;
  const requiredLeverage = notional / equity;
  const feeCostR = qty * stopDistance > 0 ? feeCost / (qty * stopDistance) : 0;

  let tradeable = true;
  if (filters.minQty != null && qty < filters.minQty) {
    tradeable = false;
    warnings.push(`Below exchange minQty ${filters.minQty} — order would be rejected.`);
  }
  if (filters.minNotional != null && notional < filters.minNotional) {
    tradeable = false;
    warnings.push(
      `Notional $${notional.toFixed(2)} is below the exchange minimum $${filters.minNotional} — order would be rejected.`,
    );
  }

  // Liquidation is decided by the margin actually posted, which is the *selected* leverage. When
  // the trader has not chosen one, assume the whole account backs the position (required leverage).
  //
  // Worth knowing why this check almost never fires on the required-leverage path: sizing from a
  // risk budget makes leverage = (riskPct/100)·entry/stopDistance, so the liquidation distance
  // works out to roughly stopDistance·(100/riskPct). At any sane risk percentage liquidation sits
  // far beyond the stop. It is the *selected* leverage — 25× left over from the last trade — that
  // pulls liquidation inside the stop and turns a planned 1R loss into a full-margin loss.
  const selected = finite(input.selectedLeverage);
  if (selected != null && selected > 0 && selected < requiredLeverage - 1e-9) {
    warnings.push(
      `Position needs ${requiredLeverage.toFixed(2)}× but leverage is set to ${selected}× — the exchange will reject or partially fill this order.`,
    );
  }
  const effectiveLeverage = selected != null && selected > 0
    ? Math.max(selected, requiredLeverage)
    : requiredLeverage;

  let liq: number | null = null;
  let liqDistancePct: number | null = null;
  let liquidationBeforeStop = false;
  if (effectiveLeverage > 1) {
    liq = liquidationPrice(entry, effectiveLeverage, input.side, mmr);
    if (liq != null) {
      liqDistancePct = (Math.abs(entry - liq) / entry) * 100;
      liquidationBeforeStop = input.side === "long" ? liq >= stop : liq <= stop;
      if (liquidationBeforeStop) {
        warnings.push(
          `Liquidation ~${liq.toFixed(4)} sits between entry and the stop ${stop} at ${effectiveLeverage.toFixed(2)}× — the exchange closes this position before your stop does, and the loss is the whole margin, not 1R.`,
        );
      }
    }
  }

  if (stopDistancePct < 0.1) {
    warnings.push(
      `Stop is only ${stopDistancePct.toFixed(3)}% away — fees and slippage dominate a stop this tight.`,
    );
  }

  return {
    qty,
    notional: Number(notional.toFixed(8)),
    risk_amount: Number(riskAmount.toFixed(8)),
    risk_pct_actual: Number(((riskAmount / equity) * 100).toFixed(4)),
    risk_budget: Number(riskBudget.toFixed(8)),
    stop_distance: Number(stopDistance.toFixed(8)),
    stop_distance_pct: Number(stopDistancePct.toFixed(4)),
    required_leverage: Number(requiredLeverage.toFixed(4)),
    effective_leverage: Number(effectiveLeverage.toFixed(4)),
    liquidation_price: liq != null ? Number(liq.toFixed(8)) : null,
    liquidation_distance_pct: liqDistancePct != null ? Number(liqDistancePct.toFixed(4)) : null,
    liquidation_before_stop: liquidationBeforeStop,
    fee_cost: Number(feeCost.toFixed(8)),
    fee_cost_r: Number(feeCostR.toFixed(4)),
    tradeable,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Kelly
// ---------------------------------------------------------------------------

/**
 * Kelly fraction for a fixed-R bet: f* = (p·(R+1) − 1) / R.
 *
 * This is the growth-optimal fraction of *capital to put at risk* per trade for a binary outcome
 * that wins R and loses 1. Returns 0 (not a negative number) when the edge is negative — the Kelly
 * answer to a losing bet is to bet nothing, and "short your own strategy" is not an option Forge
 * offers.
 */
export function kellyFraction(p: number, rewardR: number): number {
  if (!Number.isFinite(p) || !Number.isFinite(rewardR)) return 0;
  if (p <= 0 || p >= 1 || rewardR <= 0) return 0;
  const f = (p * (rewardR + 1) - 1) / rewardR;
  return f > 0 ? f : 0;
}

export type RiskSuggestion = {
  /** Suggested risk per trade as a percent of equity. */
  risk_pct: number;
  /** Full-Kelly percent, shown only so the fraction applied is visible. */
  full_kelly_pct: number;
  /** Probability the suggestion was computed from. */
  p_used: number | null;
  /** Which probability was used: the CI lower bound (preferred) or the point estimate. */
  p_source: "ci_low" | "point" | "none";
  fraction_applied: number;
  rationale: string;
};

/**
 * Suggest a risk-per-trade percent from calibrated edge.
 *
 * Two deliberate departures from textbook Kelly, both of which matter more than the formula:
 *
 * 1. **The Wilson CI lower bound is used, not the point estimate.** Kelly is famously brutal when
 *    p is overestimated — betting 2× optimal has negative expected growth. With n=25 the point
 *    estimate is worth very little and the lower bound is the honest input.
 * 2. **A quarter of Kelly by default, hard-capped.** Full Kelly's drawdowns are unlivable even when
 *    p is exactly right, and Forge's p never is. Quarter-Kelly keeps ~44% of the growth rate for a
 *    quarter of the drawdown.
 *
 * With no usable calibration this returns the floor rather than a guess — same contract as
 * `computeExpectancy`, which refuses to invent a probability.
 */
export function suggestRiskPct(input: {
  p: number | null;
  pCiLow?: number | null;
  rewardR: number | null;
  n?: number;
  /** Kelly multiplier. 0.25 = quarter Kelly. */
  fraction?: number;
  /** Hard ceiling in percent of equity. */
  cap?: number;
  /** Floor in percent of equity, used when there is no usable edge estimate. */
  floor?: number;
  /** Minimum sample size before calibration is trusted at all. */
  minSamples?: number;
}): RiskSuggestion {
  const fraction = finite(input.fraction) ?? 0.25;
  const cap = finite(input.cap) ?? 2;
  const floor = finite(input.floor) ?? 0.25;
  const minSamples = finite(input.minSamples) ?? 20;
  const n = finite(input.n) ?? 0;
  const rewardR = finite(input.rewardR);

  const none: RiskSuggestion = {
    risk_pct: floor,
    full_kelly_pct: 0,
    p_used: null,
    p_source: "none",
    fraction_applied: fraction,
    rationale: `No usable calibration (n=${n}) — defaulting to the ${floor}% floor rather than sizing off a guess.`,
  };

  if (rewardR == null || rewardR <= 0) return none;
  if (n < minSamples) return none;

  const ciLow = finite(input.pCiLow);
  const point = finite(input.p);
  const p = ciLow ?? point;
  if (p == null) return none;
  const source: RiskSuggestion["p_source"] = ciLow != null ? "ci_low" : "point";

  const fullKelly = kellyFraction(p, rewardR);
  if (fullKelly <= 0) {
    return {
      risk_pct: 0,
      full_kelly_pct: 0,
      p_used: p,
      p_source: source,
      fraction_applied: fraction,
      rationale: `Kelly is zero or negative at ${(p * 100).toFixed(1)}% hit rate and ${rewardR.toFixed(2)}R — the growth-optimal size for this edge is no position.`,
    };
  }

  const suggested = Math.min(cap, fullKelly * fraction * 100);
  return {
    risk_pct: Number(suggested.toFixed(3)),
    full_kelly_pct: Number((fullKelly * 100).toFixed(3)),
    p_used: p,
    p_source: source,
    fraction_applied: fraction,
    rationale: `${fraction === 0.25 ? "Quarter" : `${fraction}×`}-Kelly on ${(p * 100).toFixed(1)}%${
      source === "ci_low" ? " (95% CI lower bound)" : " (point estimate — no CI available)"
    } at ${rewardR.toFixed(2)}R gives ${suggested.toFixed(2)}%${
      fullKelly * fraction * 100 > cap ? `, capped at ${cap}%` : ""
    }.`,
  };
}

/**
 * Normalize Binance `exchangeInfo` symbol filters into `SymbolFilters`.
 *
 * Kept here rather than in binance.ts so the shape stays testable without network mocking, and so
 * the frontend can normalize a cached payload with the same code.
 */
export function parseSymbolFilters(
  filters: Array<Record<string, unknown>> | null | undefined,
): SymbolFilters {
  const out: SymbolFilters = { ...UNCONSTRAINED_FILTERS };
  if (!Array.isArray(filters)) return out;
  for (const filter of filters) {
    const type = String(filter?.filterType ?? "");
    if (type === "PRICE_FILTER") {
      out.tickSize = finite(filter.tickSize);
    } else if (type === "LOT_SIZE") {
      out.stepSize = finite(filter.stepSize);
      out.minQty = finite(filter.minQty);
      out.maxQty = finite(filter.maxQty);
    } else if (type === "NOTIONAL" || type === "MIN_NOTIONAL") {
      // Spot uses MIN_NOTIONAL.minNotional; newer payloads use NOTIONAL.minNotional.
      out.minNotional = finite(filter.minNotional) ?? out.minNotional;
    }
  }
  return out;
}
