/**
 * Walk-forward backtest CLI for deterministic trade plans.
 * Usage:
 *   deno run --allow-net --allow-write scripts/backtest.ts --symbol BTCUSDT --interval 4h --bars 2000
 *   deno run --allow-net --allow-write --allow-env scripts/backtest.ts --symbol BTCUSDT --interval 4h --upload
 *
 * `--upload` writes setup×regime hit rates into `setup_baselines` so live calibration can use
 * backtest rates as Bayesian priors instead of waiting weeks for cold-start n≥20.
 */
import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";
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
  string: ["symbol", "interval", "out", "symbols"],
  boolean: ["upload"],
  default: {
    symbol: "BTCUSDT",
    interval: "4h",
    bars: "500",
    step: "5",
    out: "backtest-results.json",
    upload: false,
  },
});

const interval = String(args.interval);
const totalBars = Number(args.bars);
const step = Number(args.step);
const outPath = String(args.out);
const doUpload = Boolean(args.upload);
const FORWARD_BARS = 100;

const symbols: string[] = args.symbols
  ? String(args.symbols).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : [String(args.symbol).toUpperCase()];

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
    crossMarket: ctx.crossMarket,
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

type Bucket = { n: number; hits: number; losses: number; no_fill: number; expired: number; rs: number[] };

function addToBucket(buckets: Record<string, Bucket>, key: string, outcome: string, realizedR: number | null) {
  if (!buckets[key]) buckets[key] = { n: 0, hits: 0, losses: 0, no_fill: 0, expired: 0, rs: [] };
  buckets[key].n += 1;
  if (outcome === "target_hit") buckets[key].hits += 1;
  if (outcome === "stop_hit") buckets[key].losses += 1;
  if (outcome === "no_fill") buckets[key].no_fill += 1;
  if (outcome === "expired") buckets[key].expired += 1;
  if (realizedR != null && Number.isFinite(realizedR)) buckets[key].rs.push(realizedR);
}

function summarize(buckets: Record<string, Bucket>) {
  const out: Record<string, { n: number; hit_rate: number | null; avg_r: number | null; no_fill_rate: number | null; expiry_rate: number | null }> = {};
  for (const [key, b] of Object.entries(buckets)) {
    const decided = b.hits + b.losses;
    out[key] = {
      n: b.n,
      hit_rate: decided > 0 ? Number((b.hits / decided).toFixed(3)) : null,
      avg_r: b.rs.length ? Number((b.rs.reduce((a, c) => a + c, 0) / b.rs.length).toFixed(3)) : null,
      no_fill_rate: b.n > 0 ? Number((b.no_fill / b.n).toFixed(3)) : null,
      expiry_rate: b.n > 0 ? Number((b.expired / b.n).toFixed(3)) : null,
    };
  }
  return out;
}

async function runSymbol(symbol: string) {
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

  return { symbol, interval, bars: candles.length, step, summary: summarize(buckets), buckets };
}

async function uploadBaselines(
  results: Array<{ symbol: string; interval: string; buckets: Record<string, Bucket> }>,
) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --upload");
  }
  const supabase = createClient(url, key);
  const rows: Array<{
    setup_type: string;
    regime: string;
    symbol: string;
    interval: string;
    n: number;
    hit_rate: number;
    avg_r: number | null;
    generated_at: string;
  }> = [];

  const now = new Date().toISOString();
  for (const result of results) {
    for (const [key, b] of Object.entries(result.buckets)) {
      const [setupType, regime] = key.split("|");
      const decided = b.hits + b.losses;
      if (decided <= 0 || !setupType || !regime) continue;
      rows.push({
        setup_type: setupType,
        regime,
        symbol: result.symbol,
        interval: result.interval,
        n: decided,
        hit_rate: Number((b.hits / decided).toFixed(4)),
        avg_r: b.rs.length ? Number((b.rs.reduce((a, c) => a + c, 0) / b.rs.length).toFixed(3)) : null,
        generated_at: now,
      });
    }
  }

  if (!rows.length) {
    console.log("No decided baselines to upload.");
    return;
  }

  const { error } = await supabase.from("setup_baselines").upsert(rows, {
    onConflict: "setup_type,regime,symbol,interval",
  });
  if (error) throw error;
  console.log(`Uploaded ${rows.length} setup_baselines rows.`);
}

const allResults = [];
for (const symbol of symbols) {
  console.log(`Running backtest: ${symbol} ${interval}…`);
  const result = await runSymbol(symbol);
  allResults.push(result);
  console.log(`Backtest complete: ${symbol} ${interval}`);
  console.table(result.summary);
}

await Deno.writeTextFile(
  outPath,
  JSON.stringify(
    allResults.length === 1 ? allResults[0] : { interval, results: allResults },
    null,
    2,
  ),
);

if (doUpload) {
  await uploadBaselines(allResults);
}
