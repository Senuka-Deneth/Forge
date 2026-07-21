/**
 * Walk-forward backtest CLI for deterministic trade plans.
 * Usage: deno run --allow-net --allow-write scripts/backtest.ts --symbol BTCUSDT --interval 4h --bars 2000 --step 10
 */
import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { fetchBinanceKlines } from "../supabase/functions/_shared/binance.ts";
import { buildContextFromCandles } from "../supabase/functions/_shared/aiContext.ts";
import { sliceClosedCandles } from "../supabase/functions/_shared/candles.ts";
import { scorePlanAgainstCandles } from "../supabase/functions/_shared/outcome.ts";
import {
  applyRegimeGating,
  buildDeterministicTradePlan,
  type GatingContext,
} from "../supabase/functions/_shared/tradePlan.ts";
import type { MarketContext } from "../supabase/functions/_shared/aiContext.ts";

const args = parseArgs(Deno.args, {
  string: ["symbol", "interval", "out"],
  default: {
    symbol: "BTCUSDT",
    interval: "4h",
    bars: "500",
    step: "5",
    out: "backtest-results.json",
  },
});

const symbol = String(args.symbol).toUpperCase();
const interval = String(args.interval);
const totalBars = Number(args.bars);
const step = Number(args.step);
const outPath = String(args.out);
const FORWARD_BARS = 100;

function toGatingContext(ctx: MarketContext): GatingContext {
  return {
    price: ctx.price,
    latest: ctx.latest,
    regime: ctx.regime,
    htfBias: ctx.htfBias,
    mtf: ctx.mtf,
    structure: ctx.structure,
    confluenceScore: ctx.confluenceScore,
    pivots: ctx.pivots,
    nearestSupport: ctx.nearestSupport,
    nearestResistance: ctx.nearestResistance,
  };
}

function deriveBias(ctx: MarketContext): "long" | "short" | "neutral" {
  const primaryTrend = ctx.trendStrength >= 50
    ? (ctx.latest.ema20 != null && ctx.latest.ema50 != null && ctx.price > ctx.latest.ema20 ? "bullish" : "bearish")
    : "sideways";
  const momentum = ctx.latest.macd != null && ctx.latest.macdSignal != null
    ? (ctx.latest.macd > ctx.latest.macdSignal ? "bullish" : "bearish")
    : "neutral";
  if (primaryTrend === "bullish" && momentum.includes("bullish") && ctx.confluenceScore >= 50) return "long";
  if (primaryTrend === "bearish" && momentum.includes("bearish") && ctx.confluenceScore >= 50) return "short";
  return "neutral";
}

type Bucket = { n: number; hits: number; rs: number[] };

function addToBucket(buckets: Record<string, Bucket>, key: string, outcome: string, realizedR: number | null) {
  if (!buckets[key]) buckets[key] = { n: 0, hits: 0, rs: [] };
  buckets[key].n += 1;
  if (outcome === "target_hit") buckets[key].hits += 1;
  if (realizedR != null && Number.isFinite(realizedR)) buckets[key].rs.push(realizedR);
}

function summarize(buckets: Record<string, Bucket>) {
  const out: Record<string, { n: number; hit_rate: number | null; avg_r: number | null }> = {};
  for (const [key, b] of Object.entries(buckets)) {
    out[key] = {
      n: b.n,
      hit_rate: b.n > 0 ? Number((b.hits / b.n).toFixed(3)) : null,
      avg_r: b.rs.length ? Number((b.rs.reduce((a, c) => a + c, 0) / b.rs.length).toFixed(3)) : null,
    };
  }
  return out;
}

const raw = await fetchBinanceKlines(symbol, interval, totalBars);
const closed = sliceClosedCandles(raw, interval);
const candles = closed.length ? closed : raw.slice(0, -1);

const buckets: Record<string, Bucket> = {};
const minBars = 120;

for (let i = minBars; i < candles.length - FORWARD_BARS; i += step) {
  const window = candles.slice(0, i + 1);
  const ctx = await buildContextFromCandles(symbol, interval, window, { rawPrimary: window });
  const gatingCtx = toGatingContext(ctx);
  const rawBias = deriveBias(ctx);
  const gated = applyRegimeGating(rawBias, 60, gatingCtx);
  const plan = buildDeterministicTradePlan(gatingCtx, gated.bias, gated.confidence);
  const forward = candles.slice(i + 1, i + 1 + FORWARD_BARS);
  const scored = scorePlanAgainstCandles(plan, forward, FORWARD_BARS);
  if (scored.outcome === "invalid" || scored.outcome === "pending") continue;

  const key = `${gated.setupType}|${ctx.regime}`;
  addToBucket(buckets, key, scored.outcome, scored.realized_r);
}

const summary = summarize(buckets);
await Deno.writeTextFile(outPath, JSON.stringify({ symbol, interval, bars: candles.length, step, summary }, null, 2));

console.log(`Backtest complete: ${symbol} ${interval}`);
console.table(summary);
