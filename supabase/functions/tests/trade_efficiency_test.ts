import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analyzeTradeEfficiency,
  type ExcursionRecord,
  normalizeExcursions,
} from "../_shared/tradeEfficiency.ts";

function record(over: Partial<ExcursionRecord> = {}): ExcursionRecord {
  return {
    entry: 100,
    stop: 98, // risk = 2 price units, so 1R = 2
    mae: 1,
    mfe: 4,
    realized_r: 2,
    outcome: "target_hit",
    ...over,
  };
}

function many(n: number, over: Partial<ExcursionRecord> = {}): ExcursionRecord[] {
  return new Array(n).fill(null).map(() => record(over));
}

Deno.test("normalizeExcursions converts price units to R using each trade's own risk", () => {
  const rows = normalizeExcursions([
    record({ entry: 100, stop: 98, mae: 1, mfe: 4 }),
    // Same trade shape at a completely different price scale: 1R = 0.02.
    record({ entry: 1, stop: 0.98, mae: 0.01, mfe: 0.04 }),
  ]);
  assertEquals(rows.length, 2);
  assertAlmostEquals(rows[0].mae_r, 0.5, 1e-9);
  assertAlmostEquals(rows[1].mae_r, 0.5, 1e-9);
  assertAlmostEquals(rows[0].mfe_r, 2, 1e-9);
  assertAlmostEquals(rows[1].mfe_r, 2, 1e-9);
});

Deno.test("normalizeExcursions drops rows whose risk cannot be reconstructed", () => {
  assertEquals(normalizeExcursions([record({ entry: null })]).length, 0);
  assertEquals(normalizeExcursions([record({ stop: null })]).length, 0);
  assertEquals(normalizeExcursions([record({ mae: null })]).length, 0);
  // Entry equal to stop means zero risk — dividing by it would produce Infinity.
  assertEquals(normalizeExcursions([record({ entry: 100, stop: 100 })]).length, 0);
});

Deno.test("normalizeExcursions ignores trades that never held a position", () => {
  assertEquals(normalizeExcursions([record({ outcome: "no_fill" })]).length, 0);
  assertEquals(normalizeExcursions([record({ outcome: "pending" })]).length, 0);
  assertEquals(normalizeExcursions([record({ outcome: "invalid" })]).length, 0);
});

Deno.test("normalizeExcursions uses realized R over the outcome label", () => {
  // A laddered plan can be labelled target_hit and still finish negative when only the first
  // partial filled before the stop took the rest.
  const rows = normalizeExcursions([record({ outcome: "target_hit", realized_r: -0.4 })]);
  assertEquals(rows[0].won, false);
});

Deno.test("normalizeExcursions falls back to the outcome label when realized R is absent", () => {
  const rows = normalizeExcursions([
    record({ outcome: "target_hit", realized_r: null }),
    record({ outcome: "stop_hit", realized_r: null }),
  ]);
  assertEquals(rows[0].won, true);
  assertEquals(rows[1].won, false);
});

Deno.test("normalizeExcursions takes absolute values of excursions", () => {
  const rows = normalizeExcursions([record({ mae: -1, mfe: 4 })]);
  assertAlmostEquals(rows[0].mae_r, 0.5, 1e-9);
});

Deno.test("analyzeTradeEfficiency withholds every verdict below the sample floor", () => {
  const report = analyzeTradeEfficiency(many(5));
  assertEquals(report.stop_verdict, "insufficient_data");
  assertEquals(report.target_verdict, "insufficient_data");
  assertEquals(report.suggested_stop_r, null);
  assertEquals(report.capture_efficiency, null);
});

Deno.test("analyzeTradeEfficiency flags stops that are wider than the trades need", () => {
  // Winners take only 0.1R of heat (mae 0.2 on a risk of 2).
  const winners = many(20, { mae: 0.2, mfe: 4, realized_r: 2, outcome: "target_hit" });
  const losers = many(8, { mae: 2, mfe: 0.4, realized_r: -1, outcome: "stop_hit" });
  const report = analyzeTradeEfficiency([...winners, ...losers]);
  assertEquals(report.stop_verdict, "too_wide");
  assertEquals(report.suggested_stop_r! < 0.75, true);
  // The survivorship caveat must travel with the suggestion.
  assertEquals(report.stop_note.includes("backtest hypothesis"), true);
});

Deno.test("analyzeTradeEfficiency reports stops as about right when winners use them", () => {
  const winners = many(20, { mae: 1.7, mfe: 4, realized_r: 2, outcome: "target_hit" });
  const losers = many(10, { mae: 2, mfe: 0.2, realized_r: -1, outcome: "stop_hit" });
  const report = analyzeTradeEfficiency([...winners, ...losers]);
  assertEquals(report.stop_verdict, "about_right");
});

Deno.test("analyzeTradeEfficiency detects stops being run", () => {
  // Most losers were already well in profit before they stopped out.
  const winners = many(12, { mae: 1.6, mfe: 4, realized_r: 2, outcome: "target_hit" });
  const losers = many(12, { mae: 2, mfe: 3, realized_r: -1, outcome: "stop_hit" });
  const report = analyzeTradeEfficiency([...winners, ...losers]);
  assertEquals(report.stop_verdict, "being_run");
  assertEquals(report.shakeout_rate! > 0.9, true);
  assertEquals(report.breakeven_trigger_r! > 1, true);
});

Deno.test("analyzeTradeEfficiency computes capture efficiency on winners only", () => {
  // Winners peak at 4R (mfe 8 / risk 2) and book 2R -> 50% capture.
  const winners = many(20, { mae: 0.4, mfe: 8, realized_r: 2, outcome: "target_hit" });
  const losers = many(6, { mae: 2, mfe: 0.2, realized_r: -1, outcome: "stop_hit" });
  const report = analyzeTradeEfficiency([...winners, ...losers]);
  assertAlmostEquals(report.capture_efficiency!, 0.5, 1e-6);
});

Deno.test("analyzeTradeEfficiency flags money left on the table", () => {
  // Winners run to 5R and book 1R.
  const winners = many(20, { mae: 0.4, mfe: 10, realized_r: 1, outcome: "target_hit" });
  const losers = many(6, { mae: 2, mfe: 0.2, realized_r: -1, outcome: "stop_hit" });
  const report = analyzeTradeEfficiency([...winners, ...losers]);
  assertEquals(report.target_verdict, "leaving_money");
  assertEquals(report.capture_efficiency! < 0.5, true);
});

Deno.test("analyzeTradeEfficiency flags targets that overreach", () => {
  // Winners capture nearly all of their peak, but losers routinely ran past 1R first.
  const winners = many(20, { mae: 1.6, mfe: 2.05, realized_r: 1, outcome: "target_hit" });
  const losers = many(10, { mae: 2, mfe: 3, realized_r: -1, outcome: "stop_hit" });
  const report = analyzeTradeEfficiency([...winners, ...losers]);
  assertEquals(report.target_verdict, "overreaching");
});

Deno.test("analyzeTradeEfficiency percentiles are ordered", () => {
  const rows: ExcursionRecord[] = [];
  for (let i = 0; i < 30; i += 1) {
    rows.push(record({ mae: 0.1 * (i + 1), mfe: 4, realized_r: 2, outcome: "target_hit" }));
  }
  const report = analyzeTradeEfficiency(rows);
  const p = report.winner_mae_r!;
  assertEquals(p.p50 <= p.p75, true);
  assertEquals(p.p75 <= p.p90, true);
  assertEquals(p.p90 <= p.max, true);
});

Deno.test("analyzeTradeEfficiency is not skewed by nominal price scale", () => {
  // The same twenty trades expressed at two wildly different price scales must produce
  // identical diagnostics. Raw price-unit averaging would be dominated by the larger symbol.
  const cheap = many(10, { entry: 0.5, stop: 0.49, mae: 0.002, mfe: 0.04, realized_r: 2 });
  const dear = many(10, { entry: 60_000, stop: 58_800, mae: 240, mfe: 4_800, realized_r: 2 });
  const mixed = analyzeTradeEfficiency([...cheap, ...dear]);
  const cheapOnly = analyzeTradeEfficiency(many(20, {
    entry: 0.5, stop: 0.49, mae: 0.002, mfe: 0.04, realized_r: 2,
  }));
  assertAlmostEquals(mixed.winner_mae_r!.p50, cheapOnly.winner_mae_r!.p50, 1e-6);
  assertAlmostEquals(mixed.capture_efficiency!, cheapOnly.capture_efficiency!, 1e-6);
});

Deno.test("analyzeTradeEfficiency handles an all-winners history without dividing by zero", () => {
  const report = analyzeTradeEfficiency(many(25, { realized_r: 2, outcome: "target_hit" }));
  assertEquals(report.n_losers, 0);
  assertEquals(report.shakeout_rate, null);
  assertEquals(report.loser_mfe_r, null);
  assertEquals(Number.isFinite(report.capture_efficiency!), true);
});

Deno.test("analyzeTradeEfficiency handles an all-losers history", () => {
  const report = analyzeTradeEfficiency(many(25, {
    mae: 2, mfe: 0.2, realized_r: -1, outcome: "stop_hit",
  }));
  assertEquals(report.n_winners, 0);
  assertEquals(report.winner_mae_r, null);
  assertEquals(report.target_verdict, "insufficient_data");
});

Deno.test("analyzeTradeEfficiency tolerates an empty history", () => {
  const report = analyzeTradeEfficiency([]);
  assertEquals(report.n, 0);
  assertEquals(report.stop_verdict, "insufficient_data");
  assertEquals(report.summary.includes("0 scored trades"), true);
});
