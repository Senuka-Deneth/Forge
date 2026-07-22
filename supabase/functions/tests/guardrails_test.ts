import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyGuardrailVerdict,
  evaluateGuardrails,
  type JournalSnapshot,
} from "../_shared/guardrails.ts";
import type { ExpectancyResult } from "../_shared/expectancy.ts";

function expectancy(verdict: ExpectancyResult["verdict"], overrides: Partial<ExpectancyResult> = {}): ExpectancyResult {
  return {
    ev_r: verdict === "TAKE" ? 0.3 : verdict === "SKIP" ? -0.2 : 0,
    breakeven_hit_rate: 0.4,
    p: verdict === "WAIT" ? null : 0.5,
    p_ci_low: 0.4,
    p_ci_high: 0.6,
    n: 40,
    reward_r: 2,
    cost_r: 0.05,
    verdict,
    summary: verdict === "SKIP" ? "EV -0.20R — losing bet." : "ok",
    ...overrides,
  };
}

const clearJournal: JournalSnapshot = {
  realized_r_today: 0,
  open_r: 1,
  consecutive_losses: 0,
  minutes_since_last_loss: null,
  correlated_open_count: 0,
};

Deno.test("evaluateGuardrails fires negative_ev on SKIP", () => {
  const fired = evaluateGuardrails({ expectancy: expectancy("SKIP") });
  assertEquals(fired.some((g) => g.id === "negative_ev"), true);
});

Deno.test("evaluateGuardrails is quiet on a clean TAKE", () => {
  const fired = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    journal: clearJournal,
    funding: { minutesUntil: 120, imminent: false },
    blackout: { blocked: false, label: null, minutesRemaining: null },
  });
  assertEquals(fired.length, 0);
});

Deno.test("evaluateGuardrails fires daily loss limit", () => {
  const fired = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    journal: { ...clearJournal, realized_r_today: -3.5 },
  });
  assertEquals(fired.some((g) => g.id === "daily_loss_limit"), true);
});

Deno.test("evaluateGuardrails fires consecutive-loss cooldown", () => {
  const fired = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    journal: { ...clearJournal, consecutive_losses: 3, minutes_since_last_loss: 10 },
  });
  assertEquals(fired.some((g) => g.id === "loss_cooldown"), true);
});

Deno.test("evaluateGuardrails fires funding window when imminent", () => {
  const fired = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    funding: { minutesUntil: 12, imminent: true },
  });
  assertEquals(fired.some((g) => g.id === "funding_window"), true);
});

Deno.test("evaluateGuardrails fires thin book on wide spread", () => {
  const fired = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    book: { spreadPct: 0.25, thinSideNotional: 100_000, slopeBid: null, slopeAsk: null },
  });
  assertEquals(fired.some((g) => g.id === "thin_book"), true);
});

Deno.test("evaluateGuardrails fires correlated exposure cap", () => {
  const fired = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    journal: { ...clearJournal, correlated_open_count: 3 },
  });
  assertEquals(fired.some((g) => g.id === "correlated_exposure"), true);
});

Deno.test("applyGuardrailVerdict keeps TAKE when nothing blocks", () => {
  const result = applyGuardrailVerdict(expectancy("TAKE"), []);
  assertEquals(result.verdict, "TAKE");
});

Deno.test("applyGuardrailVerdict forces WAIT when a non-overridden gate fires on +EV", () => {
  const gates = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    journal: { ...clearJournal, realized_r_today: -5 },
  });
  const result = applyGuardrailVerdict(expectancy("TAKE"), gates);
  assertEquals(result.verdict, "WAIT");
  assertEquals(result.blocked_by.length > 0, true);
});

Deno.test("applyGuardrailVerdict honours overrides", () => {
  const gates = evaluateGuardrails({
    expectancy: expectancy("TAKE"),
    journal: { ...clearJournal, realized_r_today: -5 },
  });
  const result = applyGuardrailVerdict(expectancy("TAKE"), gates, ["daily_loss_limit"]);
  assertEquals(result.verdict, "TAKE");
});

Deno.test("applyGuardrailVerdict keeps SKIP for negative EV even with overrides", () => {
  const gates = evaluateGuardrails({ expectancy: expectancy("SKIP") });
  const result = applyGuardrailVerdict(expectancy("SKIP"), gates, ["negative_ev"]);
  assertEquals(result.verdict, "SKIP");
});
