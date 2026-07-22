import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type AccountSizing, buildVerdict, sizePlanForAccount } from "../_shared/verdict.ts";
import { applyGuardrailVerdict, evaluateGuardrails } from "../_shared/guardrails.ts";
import { computeExpectancy } from "../_shared/expectancy.ts";
import { UNCONSTRAINED_FILTERS } from "../_shared/positionSizing.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

/**
 * The liquidation gate is the only non-overridable guardrail in Forge, and it was dead until the
 * sizing path was wired in. These cover the two halves that keep it honest: it fires on real
 * arithmetic, and it stays silent when the account is unknown rather than guessing one.
 */

const longPlan: TradePlan = {
  bias: "long",
  entry_zone: { low: 99, high: 101 },
  stop_loss: 90,
  targets: [{ label: "T1", price: 120, risk_reward: 2 }],
  risk_reward_summary: "2:1",
  confidence: 60,
  rationale: "test long",
};

const account: AccountSizing = {
  account_equity: 10_000,
  risk_per_trade_pct: 1,
  max_leverage: 50,
  exchange_leverage: null,
};

Deno.test("sizePlanForAccount sizes off the entry-zone midpoint", () => {
  const result = sizePlanForAccount(longPlan, account, UNCONSTRAINED_FILTERS);
  assertEquals(result != null, true);
  // Midpoint of [99, 101] is 100, so the stop at 90 sits 10 away — not 9 or 11, which is what
  // sizing off either bound alone would have given.
  assertEquals(result!.stop_distance, 10);
  // 1% of $10,000 is a $100 budget. Each unit risks the $10 move plus $0.10 of round-trip fee,
  // so 100 / 10.1 units — and the fee stays *inside* the budget rather than on top of it.
  assertEquals(result!.qty.toFixed(4), "9.9010");
  assertEquals(result!.risk_amount.toFixed(2), "100.00");
});

Deno.test("sizePlanForAccount returns null when the account is unknown", () => {
  assertEquals(sizePlanForAccount(longPlan, null, UNCONSTRAINED_FILTERS), null);
});

Deno.test("sizePlanForAccount returns null for a wait plan or missing geometry", () => {
  const waitPlan: TradePlan = { ...longPlan, bias: "wait" };
  assertEquals(sizePlanForAccount(waitPlan, account, UNCONSTRAINED_FILTERS), null);

  const noStop: TradePlan = { ...longPlan, stop_loss: null };
  assertEquals(sizePlanForAccount(noStop, account, UNCONSTRAINED_FILTERS), null);

  const noZone: TradePlan = { ...longPlan, entry_zone: null };
  assertEquals(sizePlanForAccount(noZone, account, UNCONSTRAINED_FILTERS), null);
});

Deno.test("liquidation_before_stop fires when exchange leverage is left high", () => {
  // The position needs ~0.1x, but the symbol is still set to 50x from a previous trade. At 50x,
  // liquidation sits ~2% below entry — well inside a stop that is 10% away.
  const sizing = sizePlanForAccount(
    longPlan,
    { ...account, exchange_leverage: 50 },
    UNCONSTRAINED_FILTERS,
  );
  assertEquals(sizing!.liquidation_before_stop, true);

  const expectancy = computeExpectancy(longPlan, { p: 0.55, n: 50, hits: 27 });
  const gates = evaluateGuardrails({ expectancy, sizing });
  const gate = gates.find((g) => g.id === "liquidation_before_stop");
  assertEquals(gate?.blocked, true);
  assertEquals(gate?.overridable, false);
});

Deno.test("liquidation_before_stop stays silent at the leverage the position requires", () => {
  const sizing = sizePlanForAccount(longPlan, account, UNCONSTRAINED_FILTERS);
  assertEquals(sizing!.liquidation_before_stop, false);
  assertEquals(
    evaluateGuardrails({
      expectancy: computeExpectancy(longPlan, { p: 0.55, n: 50, hits: 27 }),
      sizing,
    }).some((g) => g.id === "liquidation_before_stop"),
    false,
  );
});

Deno.test("liquidation_before_stop cannot be cleared by naming it in the override list", () => {
  const sizing = sizePlanForAccount(
    longPlan,
    { ...account, exchange_leverage: 50 },
    UNCONSTRAINED_FILTERS,
  );
  const expectancy = computeExpectancy(longPlan, { p: 0.55, n: 50, hits: 27 });
  const gates = evaluateGuardrails({ expectancy, sizing });

  // Expectancy alone would be TAKE here; the gate is the only thing holding it back.
  assertEquals(expectancy.verdict, "TAKE");
  const applied = applyGuardrailVerdict(expectancy, gates, ["liquidation_before_stop"]);
  assertEquals(applied.verdict, "WAIT");
  assertEquals(applied.blocked_by.some((g) => g.id === "liquidation_before_stop"), true);
});

Deno.test("buildVerdict carries the liquidation gate when handed sizing", () => {
  const sizing = sizePlanForAccount(
    longPlan,
    { ...account, exchange_leverage: 50 },
    UNCONSTRAINED_FILTERS,
  );
  const verdict = buildVerdict({
    plan: longPlan,
    regime: "trending",
    calibration: { n: 50, empirical_hit_rate: 0.55, bucket: "setup_regime" },
    sizing,
  });
  assertEquals(verdict.guardrails.some((g) => g.id === "liquidation_before_stop"), true);
  assertEquals(verdict.verdict, "WAIT");
});

Deno.test("buildVerdict omits the gate entirely when no account is known", () => {
  const verdict = buildVerdict({
    plan: longPlan,
    regime: "trending",
    calibration: { n: 50, empirical_hit_rate: 0.55, bucket: "setup_regime" },
  });
  assertEquals(verdict.guardrails.some((g) => g.id === "liquidation_before_stop"), false);
});
