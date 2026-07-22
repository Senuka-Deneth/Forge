/**
 * Session structure, the CME futures gap, funding-window proximity, and event blackouts.
 *
 * Crypto trades 24/7, but liquidity and behavior are not uniform across the day — the Asia session
 * tends to range, London and New York tend to drive the trend moves, and the weekend gap between
 * CME BTC futures sessions is a well-documented (if imperfect) magnet. None of this changes what a
 * setup *is*, but it changes how much you should trust it: a breakout during the thin Asia session
 * reads very differently from the same breakout at the London open.
 */

export type SessionName = "asia" | "london" | "new_york";

/**
 * UTC hour boundaries for each session. These are common simplified conventions, not exchange
 * rules — crypto has no official session calendar. London/New York overlap (13:00–16:00 UTC) is
 * deliberate: that overlap is where volume and volatility both tend to peak.
 */
export const SESSION_HOURS: Record<SessionName, { startHour: number; endHour: number }> = {
  asia: { startHour: 0, endHour: 8 },
  london: { startHour: 8, endHour: 16 },
  new_york: { startHour: 13, endHour: 21 },
};

export type SessionRange = {
  session: SessionName;
  /** UTC day this range belongs to, as days-since-epoch (so distinct days never collide). */
  dayIndex: number;
  high: number;
  low: number;
  startTime: number;
  endTime: number;
  /** True while this session's window has not yet closed. */
  isDeveloping: boolean;
};

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

function utcHourOfDay(timeSeconds: number): number {
  return Math.floor((timeSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
}

function dayIndexOf(timeSeconds: number): number {
  return Math.floor(timeSeconds / SECONDS_PER_DAY);
}

/** Every session whose window contains this UTC hour. London/New York overlap 13:00–16:00 UTC, so
 * this can return two names — a candle in the overlap genuinely belongs to both ranges. */
function sessionsForHour(hour: number): SessionName[] {
  const names: SessionName[] = [];
  for (const [name, bounds] of Object.entries(SESSION_HOURS) as Array<[SessionName, typeof SESSION_HOURS.asia]>) {
    if (hour >= bounds.startHour && hour < bounds.endHour) names.push(name);
  }
  return names;
}

/**
 * Build high/low ranges for each session across the candle history. Only meaningful on intraday
 * timeframes — on daily+ charts a single candle already spans multiple sessions, so this returns
 * an empty list rather than a misleading range built from one bar.
 */
export function computeSessionRanges(
  candles: Array<{ time: number; high: number; low: number }>,
  maxDays = 3,
): SessionRange[] {
  if (!candles.length) return [];

  // Bucket by (day, session). A bar spanning a session boundary is assigned by its open time —
  // consistent with how the rest of the codebase treats candle time as the bar's open. A bar in
  // the London/New York overlap updates *both* buckets, not whichever session happens to be
  // declared first.
  const buckets = new Map<string, SessionRange>();
  const lastCandleTime = candles[candles.length - 1].time;
  const cutoffDay = dayIndexOf(lastCandleTime) - maxDays;

  for (const candle of candles) {
    const day = dayIndexOf(candle.time);
    if (day < cutoffDay) continue;
    const hour = utcHourOfDay(candle.time);

    for (const session of sessionsForHour(hour)) {
      const key = `${day}:${session}`;
      const bounds = SESSION_HOURS[session];
      const dayStart = day * SECONDS_PER_DAY;
      const sessionStart = dayStart + bounds.startHour * SECONDS_PER_HOUR;
      const sessionEnd = dayStart + bounds.endHour * SECONDS_PER_HOUR;

      const existing = buckets.get(key);
      if (!existing) {
        buckets.set(key, {
          session,
          dayIndex: day,
          high: candle.high,
          low: candle.low,
          startTime: sessionStart,
          endTime: sessionEnd,
          isDeveloping: lastCandleTime < sessionEnd,
        });
      } else {
        existing.high = Math.max(existing.high, candle.high);
        existing.low = Math.min(existing.low, candle.low);
      }
    }
  }

  return [...buckets.values()].sort((a, b) => a.startTime - b.startTime);
}

export type SessionRelation = "above" | "inside" | "below" | "unknown";

/** Where price sits relative to a session's range. */
export function classifySessionRelation(price: number | null, range: SessionRange): SessionRelation {
  if (price == null) return "unknown";
  if (price > range.high) return "above";
  if (price < range.low) return "below";
  return "inside";
}

/**
 * Trim session ranges for the LLM prompt: the developing window per session name plus the most
 * recent completed one. The full history stays on `ctx.sessions.ranges` for chart consumers.
 */
export function sessionRangesForPrompt(ranges: SessionRange[]): SessionRange[] {
  const bySession = new Map<SessionName, SessionRange[]>();
  for (const range of ranges) {
    const list = bySession.get(range.session) ?? [];
    list.push(range);
    bySession.set(range.session, list);
  }

  const out: SessionRange[] = [];
  for (const list of bySession.values()) {
    const sorted = [...list].sort((a, b) => b.startTime - a.startTime);
    const developing = sorted.find((r) => r.isDeveloping);
    const latestCompleted = sorted.find((r) => !r.isDeveloping);
    if (developing) out.push(developing);
    if (latestCompleted && latestCompleted !== developing) out.push(latestCompleted);
  }

  return out.sort((a, b) => a.startTime - b.startTime);
}

// ---------------------------------------------------------------------------
// CME BTC futures gap
// ---------------------------------------------------------------------------

export type CmeGap = {
  fridayCloseTime: number;
  fridayClose: number;
  mondayOpenTime: number;
  mondayOpen: number;
  gapPct: number;
  direction: "up" | "down" | "none";
  /** Whether price has traded back through the gap range since it opened. */
  filled: boolean;
};

/**
 * Estimate the most recent CME BTC futures weekend gap from spot candles.
 *
 * CME BTC futures close Friday ~21:00 UTC and reopen Sunday ~22:00 UTC (approximating standard
 * time; the actual close/open is anchored to US market hours and shifts by an hour across the
 * March/November DST transitions, which this does not model). Spot crypto trades through the
 * weekend, so adjacent Sat→Sun candles are contiguous and must NOT be treated as the gap —
 * instead we take the candle nearest Friday 21:00 (close) and the candle nearest Sunday 22:00
 * (open), skipping the weekend bars in between. This is a directional estimate from spot, not a
 * measurement of the actual CME print. Only meaningful on intraday timeframes; returns null on
 * daily+ charts where a single candle already spans the whole weekend.
 */
export function findLatestCmeGap(
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>,
  intervalSeconds: number,
): CmeGap | null {
  if (!candles.length || intervalSeconds > SECONDS_PER_HOUR * 6) return null;

  const firstTime = candles[0].time;
  const lastTime = candles[candles.length - 1].time;
  const maxDelta = Math.max(intervalSeconds * 2, SECONDS_PER_HOUR);

  const findNearestIndex = (targetTime: number): number | null => {
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < candles.length; i += 1) {
      const delta = Math.abs(candles[i].time - targetTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestDelta > maxDelta) return null;
    return bestIdx;
  };

  // Walk back week by week from the latest candle, looking for a completed Friday 21:00 /
  // Sunday 22:00 pair that both land inside the series.
  const lastDate = new Date(lastTime * 1000);
  for (let weekOffset = 0; weekOffset < 12; weekOffset += 1) {
    const ref = new Date(lastDate);
    ref.setUTCDate(ref.getUTCDate() - weekOffset * 7);

    const sunday = new Date(Date.UTC(
      ref.getUTCFullYear(),
      ref.getUTCMonth(),
      ref.getUTCDate() - ref.getUTCDay(), // back to Sunday of this week
      22,
      0,
      0,
      0,
    ));
    const friday = new Date(sunday);
    friday.setUTCDate(sunday.getUTCDate() - 2);
    friday.setUTCHours(21, 0, 0, 0);

    const fridayTs = Math.floor(friday.getTime() / 1000);
    const sundayTs = Math.floor(sunday.getTime() / 1000);

    if (sundayTs > lastTime) continue;
    if (fridayTs < firstTime) break;

    const friIdx = findNearestIndex(fridayTs);
    const sunIdx = findNearestIndex(sundayTs);
    if (friIdx == null || sunIdx == null || sunIdx <= friIdx) continue;

    const fridayBar = candles[friIdx];
    const reopenBar = candles[sunIdx];
    const fridayClose = fridayBar.close;
    const mondayOpen = reopenBar.open;
    if (fridayClose <= 0) continue;

    const gapPct = ((mondayOpen - fridayClose) / fridayClose) * 100;
    const direction: CmeGap["direction"] = Math.abs(gapPct) < 0.01 ? "none" : gapPct > 0 ? "up" : "down";

    // A gap is "filled" when price trades back to the pre-gap level — the standard technical-
    // analysis definition — not merely whenever a later bar's range overlaps the open-to-close
    // span.
    let filled = false;
    if (direction === "up") {
      for (let j = sunIdx + 1; j < candles.length; j += 1) {
        if (candles[j].low <= fridayClose) {
          filled = true;
          break;
        }
      }
    } else if (direction === "down") {
      for (let j = sunIdx + 1; j < candles.length; j += 1) {
        if (candles[j].high >= fridayClose) {
          filled = true;
          break;
        }
      }
    }

    return {
      fridayCloseTime: fridayBar.time,
      fridayClose,
      mondayOpenTime: reopenBar.time,
      mondayOpen,
      gapPct: Number(gapPct.toFixed(4)),
      direction,
      filled,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Funding-window proximity
// ---------------------------------------------------------------------------

export type FundingWindow = {
  minutesUntil: number | null;
  /** True inside the configurable warning window before the next funding print. */
  imminent: boolean;
};

/**
 * How close the next funding settlement is. `nextFundingTime` is already fetched by
 * fetchFuturesContext and was previously unused — entering a leveraged position minutes before a
 * large funding print is avoidable, self-inflicted cost.
 */
export function computeFundingWindow(
  nextFundingTimeMs: number | null,
  nowMs: number = Date.now(),
  imminentThresholdMinutes = 30,
): FundingWindow {
  if (nextFundingTimeMs == null || !Number.isFinite(nextFundingTimeMs)) {
    return { minutesUntil: null, imminent: false };
  }
  const minutesUntil = (nextFundingTimeMs - nowMs) / 60000;
  if (minutesUntil < 0) return { minutesUntil: null, imminent: false };
  return {
    minutesUntil: Number(minutesUntil.toFixed(1)),
    imminent: minutesUntil <= imminentThresholdMinutes,
  };
}

// ---------------------------------------------------------------------------
// Event blackout
// ---------------------------------------------------------------------------

export type BlackoutWindow = {
  label: string;
  startMs: number;
  endMs: number;
};

/**
 * Static high-impact event schedule.
 *
 * Deliberately empty by default. FOMC/CPI dates could be hardcoded, but this file has no live feed
 * to keep them current and a wrong or stale date is worse than no date — it would either miss a
 * real blackout or manufacture a false one. Populate this from an operator-maintained source (a
 * Supabase table is the natural fit, wired up in the Phase 4 guardrails work) rather than editing
 * this constant with best-guess dates.
 */
export const DEFAULT_EVENT_BLACKOUTS: BlackoutWindow[] = [];

export type BlackoutCheck = {
  blocked: boolean;
  label: string | null;
  minutesRemaining: number | null;
};

/** Whether `nowMs` falls inside any configured blackout window. */
export function checkEventBlackout(
  nowMs: number = Date.now(),
  windows: BlackoutWindow[] = DEFAULT_EVENT_BLACKOUTS,
): BlackoutCheck {
  for (const window of windows) {
    if (nowMs >= window.startMs && nowMs <= window.endMs) {
      return {
        blocked: true,
        label: window.label,
        minutesRemaining: Number(((window.endMs - nowMs) / 60000).toFixed(1)),
      };
    }
  }
  return { blocked: false, label: null, minutesRemaining: null };
}
