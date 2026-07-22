import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computePositionSize,
  decimalsForStep,
  kellyFraction,
  liquidationPrice,
  parseSymbolFilters,
  roundDownToStep,
  roundToTick,
  suggestRiskPct,
  UNCONSTRAINED_FILTERS,
} from "../_shared/positionSizing.ts";

const BTC_FILTERS = {
  tickSize: 0.01,
  stepSize: 0.00001,
  minQty: 0.00001,
  maxQty: 9000,
  minNotional: 5,
};

Deno.test("decimalsForStep reads plain and exponent notation", () => {
  assertEquals(decimalsForStep(0.001), 3);
  assertEquals(decimalsForStep(0.00000001), 8);
  assertEquals(decimalsForStep(1), 0);
  assertEquals(decimalsForStep(0.5), 1);
});

Deno.test("roundDownToStep never rounds up", () => {
  assertEquals(roundDownToStep(1.239, 0.01), 1.23);
  assertEquals(roundDownToStep(1.2, 0.01), 1.2);
  assertEquals(roundDownToStep(0.004, 0.01), 0);
});

Deno.test("roundDownToStep does not lose a step to float error", () => {
  // 12.3 / 0.1 evaluates to 122.99999999999999 in IEEE754 — a naive floor drops a whole step.
  assertEquals(roundDownToStep(12.3, 0.1), 12.3);
  assertEquals(roundDownToStep(0.3, 0.1), 0.3);
});

Deno.test("roundDownToStep leaves the value alone without a step", () => {
  assertEquals(roundDownToStep(1.23456, null), 1.23456);
  assertEquals(roundDownToStep(1.23456, 0), 1.23456);
});

Deno.test("roundToTick rounds prices to nearest", () => {
  assertEquals(roundToTick(100.678, 0.01), 100.68);
  assertEquals(roundToTick(100.674, 0.01), 100.67);
});

Deno.test("computePositionSize solves risk budget = qty x stop distance plus fees", () => {
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 98,
    side: "long",
    maxLeverage: 10,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  // No fees: $100 budget / $2 stop distance = 50 units.
  assertAlmostEquals(result.qty, 50, 1e-6);
  assertAlmostEquals(result.risk_amount, 100, 1e-6);
  assertAlmostEquals(result.risk_pct_actual, 1, 1e-6);
  assertEquals(result.tradeable, true);
});

Deno.test("computePositionSize keeps total risk on budget once fees are included", () => {
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 98,
    side: "long",
    maxLeverage: 10,
    feeRate: 0.0005,
    filters: UNCONSTRAINED_FILTERS,
  });
  // Fees must come out of the same $100, not on top of it.
  assertEquals(result.risk_amount <= 100 + 1e-6, true);
  assertEquals(result.qty < 50, true);
  assertEquals(result.fee_cost > 0, true);
});

Deno.test("computePositionSize rounding never exceeds the risk budget", () => {
  const result = computePositionSize({
    equity: 3_333,
    riskPct: 1.7,
    entry: 63_412.37,
    stop: 62_180.11,
    side: "long",
    maxLeverage: 5,
    filters: BTC_FILTERS,
  });
  assertEquals(result.risk_amount <= result.risk_budget + 1e-6, true);
  assertEquals(roundDownToStep(result.qty, BTC_FILTERS.stepSize), result.qty);
});

Deno.test("computePositionSize sizes a short off the distance above entry", () => {
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 104,
    side: "short",
    maxLeverage: 10,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertAlmostEquals(result.qty, 25, 1e-6);
});

Deno.test("computePositionSize refuses a stop on the wrong side of entry", () => {
  const long = computePositionSize({
    equity: 10_000, riskPct: 1, entry: 100, stop: 102, side: "long", maxLeverage: 10,
  });
  assertEquals(long.qty, 0);
  assertEquals(long.tradeable, false);
  assertEquals(long.warnings[0].includes("below entry"), true);

  const short = computePositionSize({
    equity: 10_000, riskPct: 1, entry: 100, stop: 98, side: "short", maxLeverage: 10,
  });
  assertEquals(short.qty, 0);
  assertEquals(short.warnings[0].includes("above entry"), true);
});

Deno.test("computePositionSize caps the position at the leverage ceiling", () => {
  // A 0.1% stop wants 1000x notional on a 1% risk budget; a 3x account cannot carry it.
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 99.9,
    side: "long",
    maxLeverage: 3,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertAlmostEquals(result.notional, 30_000, 1e-6);
  assertAlmostEquals(result.required_leverage, 3, 1e-6);
  assertEquals(result.risk_pct_actual < 1, true);
  assertEquals(result.warnings.some((w) => w.includes("leverage limit")), true);
});

Deno.test("computePositionSize flags an order below the exchange minimum notional", () => {
  // $1 risk budget behind a 30% stop buys ~$3 of notional — under Binance's $5 floor.
  const result = computePositionSize({
    equity: 200,
    riskPct: 0.5,
    entry: 60_000,
    stop: 42_000,
    side: "long",
    maxLeverage: 1,
    filters: BTC_FILTERS,
  });
  assertEquals(result.notional < 5, true);
  assertEquals(result.tradeable, false);
  assertEquals(result.warnings.some((w) => w.includes("below the exchange minimum")), true);
});

Deno.test("computePositionSize reports zero size when a lot costs more than the budget", () => {
  const result = computePositionSize({
    equity: 100,
    riskPct: 1,
    entry: 60_000,
    stop: 30_000,
    side: "long",
    maxLeverage: 1,
    filters: { ...BTC_FILTERS, stepSize: 0.001, minQty: 0.001 },
  });
  assertEquals(result.qty, 0);
  assertEquals(result.tradeable, false);
});

Deno.test("computePositionSize rejects non-positive equity and risk", () => {
  assertEquals(computePositionSize({ equity: 0, riskPct: 1, entry: 100, stop: 98, side: "long" }).qty, 0);
  assertEquals(computePositionSize({ equity: 1000, riskPct: 0, entry: 100, stop: 98, side: "long" }).qty, 0);
});

Deno.test("liquidationPrice matches the isolated-margin derivation", () => {
  // 10x long at 100 with zero maintenance margin liquidates at a 10% drawdown.
  assertAlmostEquals(liquidationPrice(100, 10, "long", 0)!, 90, 1e-9);
  assertAlmostEquals(liquidationPrice(100, 10, "short", 0)!, 110, 1e-9);
  // A non-zero maintenance rate pulls liquidation closer to entry on both sides.
  assertEquals(liquidationPrice(100, 10, "long", 0.004)! > 90, true);
  assertEquals(liquidationPrice(100, 10, "short", 0.004)! < 110, true);
});

Deno.test("liquidationPrice returns null without usable leverage", () => {
  assertEquals(liquidationPrice(100, 0, "long"), null);
  assertEquals(liquidationPrice(0, 10, "long"), null);
});

Deno.test("computePositionSize warns when the selected leverage liquidates before the stop", () => {
  // Risk-budget sizing only needs ~2x here, but the symbol is left set to 25x. The posted isolated
  // margin is then ~4% of notional, so liquidation lands ~4% from entry — inside the 5% stop.
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 95,
    side: "long",
    maxLeverage: 25,
    selectedLeverage: 25,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertEquals(result.effective_leverage, 25);
  assertEquals(result.liquidation_before_stop, true);
  assertEquals(result.warnings.some((w) => w.includes("Liquidation")), true);
});

Deno.test("computePositionSize is safe at the same size when leverage is left at required", () => {
  // Identical trade, no selected leverage: the account backs the position and the stop is reached
  // long before liquidation. Same size, completely different survival profile.
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 95,
    side: "long",
    maxLeverage: 25,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertEquals(result.liquidation_before_stop, false);
  assertEquals(result.warnings.some((w) => w.includes("Liquidation")), false);
});

Deno.test("computePositionSize warns when selected leverage cannot carry the position", () => {
  // Leverage needed is riskPct/stopPct = 1%/0.1% = 10x; the symbol is set to 5x.
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 99.9,
    side: "long",
    maxLeverage: 100,
    selectedLeverage: 5,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertEquals(result.required_leverage > 5, true);
  assertEquals(result.warnings.some((w) => w.includes("leverage is set to")), true);
});

Deno.test("computePositionSize liquidation warning fires for shorts too", () => {
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 105,
    side: "short",
    maxLeverage: 25,
    selectedLeverage: 25,
    feeRate: 0,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertEquals(result.liquidation_price! < 105, true);
  assertEquals(result.liquidation_before_stop, true);
});

Deno.test("computePositionSize omits a liquidation price when unlevered", () => {
  const result = computePositionSize({
    equity: 10_000,
    riskPct: 1,
    entry: 100,
    stop: 90,
    side: "long",
    maxLeverage: 1,
    filters: UNCONSTRAINED_FILTERS,
  });
  assertEquals(result.required_leverage <= 1, true);
  assertEquals(result.liquidation_price, null);
});

Deno.test("kellyFraction matches the closed form and floors at zero", () => {
  // p=0.6, R=1 -> (0.6*2 - 1)/1 = 0.2
  assertAlmostEquals(kellyFraction(0.6, 1), 0.2, 1e-9);
  // p=0.4, R=2 -> (0.4*3 - 1)/2 = 0.1
  assertAlmostEquals(kellyFraction(0.4, 2), 0.1, 1e-9);
  // Negative edge returns zero, not a negative bet.
  assertEquals(kellyFraction(0.3, 1), 0);
  assertEquals(kellyFraction(0, 2), 0);
  assertEquals(kellyFraction(1, 2), 0);
});

Deno.test("suggestRiskPct prefers the CI lower bound over the point estimate", () => {
  const suggestion = suggestRiskPct({ p: 0.6, pCiLow: 0.45, rewardR: 2, n: 60 });
  assertEquals(suggestion.p_source, "ci_low");
  assertEquals(suggestion.p_used, 0.45);
  // Quarter Kelly on p=0.45, R=2 -> f = (0.45*3-1)/2 = 0.175 -> 4.375% -> capped at 2%.
  assertAlmostEquals(suggestion.full_kelly_pct, 17.5, 1e-6);
  assertEquals(suggestion.risk_pct, 2);
});

Deno.test("suggestRiskPct falls back to the floor when the sample is thin", () => {
  const suggestion = suggestRiskPct({ p: 0.9, pCiLow: 0.8, rewardR: 3, n: 4, floor: 0.25 });
  assertEquals(suggestion.risk_pct, 0.25);
  assertEquals(suggestion.p_source, "none");
});

Deno.test("suggestRiskPct returns zero risk when the edge is negative", () => {
  const suggestion = suggestRiskPct({ p: 0.25, pCiLow: 0.2, rewardR: 1, n: 100 });
  assertEquals(suggestion.risk_pct, 0);
  assertEquals(suggestion.rationale.includes("no position"), true);
});

Deno.test("suggestRiskPct uses the point estimate when no CI is supplied", () => {
  const suggestion = suggestRiskPct({ p: 0.5, pCiLow: null, rewardR: 2, n: 50, cap: 10 });
  assertEquals(suggestion.p_source, "point");
  // f = (0.5*3-1)/2 = 0.25 -> quarter Kelly = 6.25%
  assertAlmostEquals(suggestion.risk_pct, 6.25, 1e-6);
});

Deno.test("suggestRiskPct treats a null CI as absent rather than as a 0% hit rate", () => {
  // Regression: Number(null) is 0 and finite, so an unguarded coercion read "no CI" as p=0 and
  // silently recommended zero risk on a perfectly good edge.
  const withNull = suggestRiskPct({ p: 0.55, pCiLow: null, rewardR: 2, n: 50, cap: 10 });
  const withUndefined = suggestRiskPct({ p: 0.55, rewardR: 2, n: 50, cap: 10 });
  assertEquals(withNull.risk_pct > 0, true);
  assertEquals(withNull.risk_pct, withUndefined.risk_pct);
  assertEquals(withNull.p_used, 0.55);
});

Deno.test("parseSymbolFilters normalizes a Binance exchangeInfo payload", () => {
  const filters = parseSymbolFilters([
    { filterType: "PRICE_FILTER", tickSize: "0.01000000", minPrice: "0.01" },
    { filterType: "LOT_SIZE", stepSize: "0.00001000", minQty: "0.00001000", maxQty: "9000.00000000" },
    { filterType: "NOTIONAL", minNotional: "5.00000000" },
  ]);
  assertEquals(filters.tickSize, 0.01);
  assertEquals(filters.stepSize, 0.00001);
  assertEquals(filters.minQty, 0.00001);
  assertEquals(filters.maxQty, 9000);
  assertEquals(filters.minNotional, 5);
});

Deno.test("parseSymbolFilters accepts the legacy MIN_NOTIONAL filter", () => {
  const filters = parseSymbolFilters([{ filterType: "MIN_NOTIONAL", minNotional: "10.0" }]);
  assertEquals(filters.minNotional, 10);
});

Deno.test("parseSymbolFilters is unconstrained on junk input", () => {
  assertEquals(parseSymbolFilters(null), UNCONSTRAINED_FILTERS);
  assertEquals(parseSymbolFilters([]), UNCONSTRAINED_FILTERS);
});
