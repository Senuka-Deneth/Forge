import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { safeError } from "../_shared/http.ts";
import { tryServiceClient } from "../_shared/auth.ts";
import { isCronSecretConfigured, verifyCronSecret } from "../_shared/cronAuth.ts";
import { fetchBinanceKlines } from "../_shared/binance.ts";
import { scorePlanAgainstCandles } from "../_shared/outcome.ts";
import type { TradePlan } from "../_shared/tradePlan.ts";

const BATCH_SIZE = 50;
const EXPIRE_BARS = 100;
const BATCH_DEADLINE_MS = 45_000;

type LogRow = {
  id: string;
  symbol: string | null;
  timeframe: string | null;
  created_at: string;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
};

function asTradePlan(payload: Record<string, unknown> | null): TradePlan | null {
  const plan = payload?.trade_plan;
  if (!plan || typeof plan !== "object") return null;
  return plan as TradePlan;
}

async function scoreRow(row: LogRow) {
  const symbol = row.symbol;
  const interval = row.timeframe;
  const plan = asTradePlan(row.response_payload);
  if (!symbol || !interval || !plan || plan.bias === "wait") {
    return {
      outcome: "invalid" as const,
      bars_to_outcome: null,
      filled_at_bar: null,
      mfe: null,
      mae: null,
      realized_r: null,
      scoring_version: 2,
    };
  }

  const analysisTime = Math.floor(new Date(row.created_at).getTime() / 1000);
  const candles = await fetchBinanceKlines(symbol, interval, EXPIRE_BARS + 5, { startTime: analysisTime });
  const forward = candles.filter((c) => c.time >= analysisTime).slice(0, EXPIRE_BARS);
  return scorePlanAgainstCandles(plan, forward, EXPIRE_BARS);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") return jsonResponse(req, { success: false, error: "Method not allowed." }, 405);

  if (!isCronSecretConfigured()) {
    return jsonResponse(req, { success: false, error: "CRON_SECRET not configured." }, 503);
  }
  if (!(await verifyCronSecret(req.headers.get("X-Cron-Secret")))) {
    return jsonResponse(req, { success: false, error: "Unauthorized." }, 401);
  }

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

    const batchStarted = Date.now();
    let scored = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of (rows ?? []) as LogRow[]) {
      if (Date.now() - batchStarted >= BATCH_DEADLINE_MS) {
        skipped += 1;
        continue;
      }
      try {
        const result = await scoreRow(row);
        const { error: updateError } = await supabase
          .from("ai_analysis_logs")
          .update({
            evaluated_at: new Date().toISOString(),
            outcome: result.outcome,
            bars_to_outcome: result.bars_to_outcome,
            filled_at_bar: result.filled_at_bar,
            scoring_version: result.scoring_version,
            mfe: result.mfe,
            mae: result.mae,
            realized_r: result.realized_r,
          })
          .eq("id", row.id);
        if (!updateError) scored += 1;
      } catch (rowError) {
        failed += 1;
        console.error("[score-predictions] row failed:", row.id, rowError instanceof Error ? rowError.message : String(rowError));
      }
    }

    return jsonResponse(req, { success: true, processed: rows?.length ?? 0, scored, failed, skipped });
  } catch (error) {
    return jsonResponse(req, { success: false, error: safeError("Prediction scoring failed.", error) }, 500);
  }
});
