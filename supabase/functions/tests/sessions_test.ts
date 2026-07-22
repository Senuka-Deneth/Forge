import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkEventBlackout,
  classifySessionRelation,
  computeFundingWindow,
  computeSessionRanges,
  findLatestCmeGap,
  sessionRangesForPrompt,
  SESSION_HOURS,
} from "../_shared/sessions.ts";

const HOUR = 3600;
const DAY = 86400;

/** UTC timestamp for a given day offset and hour-of-day, from a fixed Monday-aligned epoch base. */
function ts(dayOffset: number, hour: number) {
  // 2024-01-01 00:00:00 UTC was a Monday, and is a round day index — a stable, easy-to-reason base.
  const MONDAY_2024_01_01 = Math.floor(Date.UTC(2024, 0, 1) / 1000);
  return MONDAY_2024_01_01 + dayOffset * DAY + hour * HOUR;
}

function bar(time: number, high: number, low: number) {
  return { time, high, low };
}

Deno.test("computeSessionRanges buckets candles into the correct session by UTC hour", () => {
  const candles = [
    bar(ts(0, 1), 101, 99), // asia (0-8)
    bar(ts(0, 10), 105, 95), // london only (8-16, before new_york opens at 13)
    bar(ts(0, 18), 110, 90), // new_york only (13-21, after london has closed at 16)
  ];
  const ranges = computeSessionRanges(candles);
  const bySession = Object.fromEntries(ranges.map((r) => [r.session, r]));

  assertEquals(bySession.asia.high, 101);
  assertEquals(bySession.asia.low, 99);
  assertEquals(bySession.london.high, 105);
  assertEquals(bySession.new_york.high, 110);
});

Deno.test("computeSessionRanges lets a bar in the London/New York overlap update both ranges", () => {
  // Hour 14 sits in both London (8-16) and New York (13-21) — the overlap is deliberate (see
  // module docstring on where volume peaks), so this bar must count toward both, not just
  // whichever session happens to be declared first.
  const candles = [bar(ts(0, 14), 110, 90)];
  const ranges = computeSessionRanges(candles);
  const sessions = ranges.map((r) => r.session).sort();
  assertEquals(sessions, ["london", "new_york"]);
  for (const range of ranges) {
    assertEquals(range.high, 110);
    assertEquals(range.low, 90);
  }
});

Deno.test("computeSessionRanges expands high/low across multiple bars in the same session", () => {
  const candles = [
    bar(ts(0, 9), 105, 98),
    bar(ts(0, 10), 108, 96),
    bar(ts(0, 11), 103, 100),
  ];
  const ranges = computeSessionRanges(candles);
  const london = ranges.find((r) => r.session === "london")!;
  assertEquals(london.high, 108);
  assertEquals(london.low, 96);
});

Deno.test("computeSessionRanges marks only the still-open session as developing", () => {
  const candles = [
    bar(ts(0, 1), 101, 99), // asia, day 0 — long closed
    bar(ts(1, 9), 105, 95), // london, day 1 — the last bar in the series
  ];
  const ranges = computeSessionRanges(candles);
  const asia = ranges.find((r) => r.session === "asia")!;
  const london = ranges.find((r) => r.session === "london")!;
  assertEquals(asia.isDeveloping, false);
  assertEquals(london.isDeveloping, true);
});

Deno.test("computeSessionRanges drops sessions older than the lookback window", () => {
  // dayIndex is an absolute days-since-epoch count, not the small offset passed to ts() — assert
  // against the actual computed indices rather than the offsets themselves.
  const dayIndexOfOffset = (offset: number) => Math.floor(ts(offset, 0) / DAY);
  const oldDay = dayIndexOfOffset(0);
  const anchorDay = dayIndexOfOffset(5);

  const candles = [
    bar(ts(0, 1), 101, 99), // should be dropped with a 1-day lookback from day 5
    bar(ts(5, 1), 200, 199), // the anchor
  ];
  const ranges = computeSessionRanges(candles, 1);
  assertEquals(ranges.some((r) => r.dayIndex === oldDay), false);
  assertEquals(ranges.some((r) => r.dayIndex === anchorDay), true);
});

Deno.test("computeSessionRanges returns nothing for an empty series", () => {
  assertEquals(computeSessionRanges([]), []);
});

Deno.test("sessionRangesForPrompt keeps developing plus latest completed range per session", () => {
  const ranges = [
    { session: "asia" as const, dayIndex: 1, high: 101, low: 99, startTime: 100, endTime: 200, isDeveloping: false },
    { session: "asia" as const, dayIndex: 2, high: 105, low: 95, startTime: 300, endTime: 400, isDeveloping: true },
    { session: "london" as const, dayIndex: 2, high: 110, low: 90, startTime: 350, endTime: 450, isDeveloping: true },
  ];
  const trimmed = sessionRangesForPrompt(ranges);
  assertEquals(trimmed.length, 3);
  assertEquals(trimmed.filter((r) => r.session === "asia").length, 2);
  assertEquals(trimmed.filter((r) => r.session === "london").length, 1);
  assertEquals(trimmed.filter((r) => r.isDeveloping).length, 2);
});

Deno.test("SESSION_HOURS windows do not gap the day and london/NY overlap as documented", () => {
  assertEquals(SESSION_HOURS.asia.startHour, 0);
  assertEquals(SESSION_HOURS.london.startHour, SESSION_HOURS.asia.endHour);
  // The overlap is deliberate (see module docstring) — new_york starts before london ends.
  assertEquals(SESSION_HOURS.new_york.startHour < SESSION_HOURS.london.endHour, true);
});

Deno.test("classifySessionRelation places price against a session range", () => {
  const range = { session: "asia" as const, dayIndex: 0, high: 110, low: 90, startTime: 0, endTime: 1, isDeveloping: false };
  assertEquals(classifySessionRelation(115, range), "above");
  assertEquals(classifySessionRelation(85, range), "below");
  assertEquals(classifySessionRelation(100, range), "inside");
  assertEquals(classifySessionRelation(null, range), "unknown");
});

// ---------------------------------------------------------------------------
// CME gap
// ---------------------------------------------------------------------------

/** Contiguous hourly candles Fri 18:00 → Mon 02:00 with a price jump at Sunday 22:00. */
function contiguousWeekendCandles(opts: {
  fridayClose: number;
  sundayOpen: number;
  fillThroughFridayClose?: boolean;
}) {
  const candles: Array<{ time: number; open: number; high: number; low: number; close: number }> = [];
  // day 4 = Friday, day 6 = Sunday, day 7 = Monday (from Monday=0 base)
  for (let day = 4; day <= 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      if (day === 4 && hour < 18) continue;
      if (day === 7 && hour > 2) continue;
      const time = ts(day, hour);
      const isReopen = day === 6 && hour === 22;
      const afterReopen = day > 6 || (day === 6 && hour > 22);
      const px = isReopen || afterReopen ? opts.sundayOpen : opts.fridayClose;
      const low = opts.fillThroughFridayClose && afterReopen
        ? Math.min(px, opts.fridayClose)
        : px - 0.5;
      candles.push({
        time,
        open: px,
        high: px + 0.5,
        low,
        close: px,
      });
    }
  }
  return candles;
}

Deno.test("findLatestCmeGap detects a weekend gap up from Fri 21:00 / Sun 22:00 on contiguous data", () => {
  const candles = contiguousWeekendCandles({ fridayClose: 100, sundayOpen: 105 });
  const gap = findLatestCmeGap(candles, HOUR);
  assertEquals(gap?.direction, "up");
  assertEquals(gap?.filled, false);
  assertEquals(gap!.gapPct > 0, true);
  // Contiguous weekend bars must not collapse the gap to ~0.
  assertEquals(Math.abs(gap!.gapPct) > 1, true);
});

Deno.test("findLatestCmeGap marks a gap filled once price trades back through Friday close", () => {
  const candles = contiguousWeekendCandles({
    fridayClose: 100,
    sundayOpen: 105,
    fillThroughFridayClose: true,
  });
  const gap = findLatestCmeGap(candles, HOUR);
  assertEquals(gap?.filled, true);
});

Deno.test("findLatestCmeGap returns none direction for a negligible gap", () => {
  const candles = contiguousWeekendCandles({ fridayClose: 100, sundayOpen: 100.001 });
  assertEquals(findLatestCmeGap(candles, HOUR)?.direction, "none");
});

Deno.test("findLatestCmeGap does not treat contiguous weekend bars as a zero gap", () => {
  // Regression: old adjacent-candle logic saw Sat→Sun continuity as gap≈0 / "none".
  const candles = contiguousWeekendCandles({ fridayClose: 100, sundayOpen: 108 });
  const gap = findLatestCmeGap(candles, HOUR);
  assertEquals(gap?.direction, "up");
  assertEquals(gap!.gapPct > 5, true);
});

Deno.test("findLatestCmeGap returns null on daily-plus intervals", () => {
  const candles = contiguousWeekendCandles({ fridayClose: 100, sundayOpen: 105 });
  assertEquals(findLatestCmeGap(candles, DAY), null);
});

Deno.test("findLatestCmeGap returns null when no weekend boundary exists in the data", () => {
  const candles = [
    { time: ts(0, 1), open: 100, high: 101, low: 99, close: 100 },
    { time: ts(0, 2), open: 100, high: 101, low: 99, close: 100 },
  ];
  assertEquals(findLatestCmeGap(candles, HOUR), null);
});

// ---------------------------------------------------------------------------
// Funding window
// ---------------------------------------------------------------------------

Deno.test("computeFundingWindow reports minutes until funding and flags the imminent window", () => {
  const now = 1_000_000_000;
  const in10min = now + 10 * 60_000;
  const in2h = now + 2 * 60 * 60_000;

  assertEquals(computeFundingWindow(in10min, now).imminent, true);
  assertEquals(computeFundingWindow(in2h, now).imminent, false);
  assertEquals(computeFundingWindow(in2h, now).minutesUntil, 120);
});

Deno.test("computeFundingWindow handles missing or already-past funding times", () => {
  assertEquals(computeFundingWindow(null, 1000), { minutesUntil: null, imminent: false });
  assertEquals(computeFundingWindow(500, 1000).minutesUntil, null); // funding time in the past
});

// ---------------------------------------------------------------------------
// Event blackout
// ---------------------------------------------------------------------------

Deno.test("checkEventBlackout reports the active window and time remaining", () => {
  const windows = [{ label: "FOMC", startMs: 1000, endMs: 5000 }];
  const result = checkEventBlackout(3000, windows);
  assertEquals(result.blocked, true);
  assertEquals(result.label, "FOMC");
  assertEquals(result.minutesRemaining, Number(((5000 - 3000) / 60000).toFixed(1)));
});

Deno.test("checkEventBlackout is inert with the default (empty) schedule", () => {
  assertEquals(checkEventBlackout(Date.now()).blocked, false);
});

Deno.test("checkEventBlackout ignores windows outside the current time", () => {
  const windows = [{ label: "CPI", startMs: 1000, endMs: 2000 }];
  assertEquals(checkEventBlackout(500, windows).blocked, false);
  assertEquals(checkEventBlackout(2500, windows).blocked, false);
});
