import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { tryServiceClient } from "../_shared/auth.ts";
import { fetchBinanceKlines } from "../_shared/binance.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "local-dev-cron-secret";
const BATCH_SIZE = 50;
const EXPIRE_BARS = 100;

type LogRow = {
  id: string;
  symbol: string | null;
  timeframe: string | null;
  created_at: string;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
};

function verifyCron(req: Request): boolean {
  return req.headers.get("X-Cron-Secret") === CRON_SECRET;
}

function asTradePlan(payload: Record<string, unknown> | null): TradePlan | null {
  const plan = payload?.trade_plan;
  if (!plan || typeof plan !== "object") return null;
  return plan as TradePlan;
}

function barHitLong(bar: { high: number; low: number }, stop: number, target: number): "stop" | "target" | "none" {
  const stopHit = bar.low <= stop;
  const targetHit = bar.high >= target;
  if (stopHit && targetHit) return "stop";
  if (stopHit) return "stop";
  if (targetHit) return "target";
  return "none";
}

function barHitShort(bar: { high: number; low: number }, stop: number, target: number): "stop" | "target" | "none" {
  const stopHit = bar.high >= stop;
  const targetHit = bar.low <= target;
  if (stopHit && targetHit) return "stop";
  if (stopHit) return "stop";
  if (targetHit) return "target";
  return "none";
}

async function scoreRow(row: LogRow) {
  const symbol = row.symbol;
  const interval = row.timeframe;
  const plan = asTradePlan(row.response_payload);
  if (!symbol || !interval || !plan || plan.bias === "wait") {
    return { outcome: "invalid" as const, bars_to_outcome: null, mfe: null, mae: null, realized_r: null };
  }

  const stop = Number(plan.stop_loss);
  const entryLow = Number(plan.entry_zone?.low);
  const entryHigh = Number(plan.entry_zone?.high);
  const target = Number(plan.targets?.[0]?.price);
  if (![stop, entryLow, entryHigh, target].every(Number.isFinite)) {
    return { outcome: "invalid" as const, bars_to_outcome: null, mfe: null, mae: null, realized_r: null };
  }

  const entry = (entryLow + entryHigh) / 2;
  const analysisTime = Math.floor(new Date(row.created_at).getTime() / 1000);
  const candles = await fetchBinanceKlines(symbol, interval, EXPIRE_BARS + 5, { startTime: analysisTime });
  const forward = candles.filter((c) => c.time >= analysisTime).slice(0, EXPIRE_BARS);
  if (!forward.length) {
    return { outcome: "pending" as const, bars_to_outcome: null, mfe: null, mae: null, realized_r: null };
  }

  const isLong = plan.bias === "long";
  const risk = Math.abs(entry - stop);
  let mfe = 0;
  let mae = 0;

  for (let i = 0; i < forward.length; i += 1) {
    const bar = forward[i];
    const fav = isLong ? bar.high - entry : entry - bar.low;
    const adv = isLong ? entry - bar.low : bar.high - entry;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);

    const hit = isLong
      ? barHitLong(bar, stop, target)
      : barHitShort(bar, stop, target);

    if (hit === "stop") {
      return {
        outcome: "stop_hit" as const,
        bars_to_outcome: i + 1,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((-1).toFixed(3)) : null,
      };
    }
    if (hit === "target") {
      const reward = Math.abs(target - entry);
      return {
        outcome: "target_hit" as const,
        bars_to_outcome: i + 1,
        mfe: Number(mfe.toFixed(6)),
        mae: Number(mae.toFixed(6)),
        realized_r: risk > 0 ? Number((reward / risk).toFixed(3)) : null,
      };
    }
  }

  return {
    outcome: "expired" as const,
    bars_to_outcome: forward.length,
    mfe: Number(mfe.toFixed(6)),
    mae: Number(mae.toFixed(6)),
    realized_r: 0,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse(req, { success: false, error: "Method not allowed." }, 405);
  if (!verifyCron(req)) return jsonResponse(req, { success: false, error: "Unauthorized." }, 401);

  const clientResult = tryServiceClient();
  if (!clientResult.ok) {
    return jsonResponse(req, { success: false, error: clientResult.error }, 503);
  }
  const supabase = clientResult.client;

  try {
    const { data: rows, error } = await supabase
      .from("ai_analysis_logs")
      .select("id, symbol, timeframe, created_at, request_payload, response_payload")
      .eq("status", "success")
      .is("evaluated_at", null)
      .not("response_payload", "is", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    let scored = 0;
    for (const row of (rows ?? []) as LogRow[]) {
      const result = await scoreRow(row);
      const { error: updateError } = await supabase
        .from("ai_analysis_logs")
        .update({
          evaluated_at: new Date().toISOString(),
          outcome: result.outcome,
          bars_to_outcome: result.bars_to_outcome,
          mfe: result.mfe,
          mae: result.mae,
          realized_r: result.realized_r,
        })
        .eq("id", row.id);
      if (!updateError) scored += 1;
    }

    return jsonResponse(req, { success: true, processed: rows?.length ?? 0, scored });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Prediction scoring failed.", error) }, 500);
  }
});
