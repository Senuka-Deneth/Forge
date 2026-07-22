import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildVerdict, bookQualityFromOrderFlow } from "../_shared/verdict.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

const longPlan: TradePlan = {
  bias: "long",
  entry_zone: { low: 100, high: 100 },
  stop_loss: 98,
  targets: [{ label: "T1", price: 104, risk_reward: 2 }],
  risk_reward_summary: "2:1",
  confidence: 60,
  rationale: "test long",
};

Deno.test("buildVerdict TAKE when calibrated p beats breakeven", () => {
  const verdict = buildVerdict({
    plan: longPlan,
    regime: "trending",
    calibration: { n: 50, empirical_hit_rate: 0.55, bucket: "setup_regime" },
  });
  assertEquals(verdict.verdict, "TAKE");
  assertEquals(verdict.expectancy.ev_r > 0, true);
  assertEquals(verdict.management.trail.method, "supertrend");
});

Deno.test("buildVerdict SKIP on negative EV", () => {
  const verdict = buildVerdict({
    plan: longPlan,
    regime: "trending",
    calibration: { n: 40, empirical_hit_rate: 0.2, bucket: "setup" },
  });
  assertEquals(verdict.verdict, "SKIP");
  assertEquals(verdict.guardrails.some((g) => g.id === "negative_ev"), true);
});

Deno.test("buildVerdict WAIT without calibration", () => {
  const verdict = buildVerdict({
    plan: longPlan,
    regime: "ranging",
    calibration: null,
  });
  assertEquals(verdict.verdict, "WAIT");
  assertEquals(verdict.management.trail.method, "chandelier");
});

Deno.test("bookQualityFromOrderFlow picks the thin side of the ±1% band", () => {
  const book = bookQualityFromOrderFlow({
    spreadPct: 0.02,
    bands: [
      { depthPct: 0.001, bidNotional: 1e6, askNotional: 1e6 },
      { depthPct: 0.01, bidNotional: 50_000, askNotional: 10_000 },
    ],
    slopeBid: 40_000,
    slopeAsk: 8_000,
  });
  assertEquals(book?.thinSideNotional, 10_000);
  assertEquals(book?.slopeAsk, 8_000);
});
