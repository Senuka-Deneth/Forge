/**
 * Volume-at-price analysis.
 *
 * Extracted from features.ts and rebuilt. The previous implementation assigned each candle's entire
 * volume to a single bin at its midpoint, which biases the point of control toward wherever wide
 * bars happened to be centred and understates the shoulders of the distribution. Volume is now
 * spread across each candle's traded range.
 *
 * Beyond POC/VAH/VAL this adds the nodes that actually change decisions: high-volume nodes where
 * price stalls, low-volume nodes it accelerates through, and untested prior points of control that
 * act as magnets.
 */

type ProfileCandle = {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type VolumeNode = {
  price: number;
  volume: number;
  /** Share of total volume in this bin, 0–1. */
  share: number;
};

export type VolumeProfile = {
  poc: number | null;
  vah: number | null;
  val: number | null;
  /** Bins where volume clusters — price tends to stall and range here. */
  hvn: VolumeNode[];
  /** Thin bins — price tends to travel through these quickly. */
  lvn: VolumeNode[];
  binSize: number | null;
  totalVolume: number;
};

export type NakedPoc = {
  price: number;
  /** Index of the session whose POC this was. */
  sessionIndex: number;
  time: number | null;
  barsAgo: number;
};

export type VolumeProfileResult = {
  composite: VolumeProfile;
  /** Profile of the most recent (still forming) session. */
  developing: VolumeProfile | null;
  /** Prior-session POCs price has not traded back to. */
  nakedPocs: NakedPoc[];
};

function round6(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(6));
}

const EMPTY_PROFILE: VolumeProfile = {
  poc: null,
  vah: null,
  val: null,
  hvn: [],
  lvn: [],
  binSize: null,
  totalVolume: 0,
};

/**
 * Distribute one candle's volume across the bins its range covers.
 *
 * Uniform across the high–low range: without tick data this is the honest assumption, and it is
 * strictly better than dumping the whole bar at its midpoint, which manufactures a spike at a
 * price that may never have traded heavily.
 */
function accumulate(
  histogram: number[],
  candle: ProfileCandle,
  minPrice: number,
  binSize: number,
  bins: number,
): void {
  const volume = Number.isFinite(candle.volume) && candle.volume > 0 ? candle.volume : 0;
  if (volume <= 0) return;

  const lowBin = Math.min(bins - 1, Math.max(0, Math.floor((candle.low - minPrice) / binSize)));
  const highBin = Math.min(bins - 1, Math.max(0, Math.floor((candle.high - minPrice) / binSize)));

  if (highBin === lowBin) {
    histogram[lowBin] += volume;
    return;
  }

  const span = highBin - lowBin + 1;
  const perBin = volume / span;
  for (let b = lowBin; b <= highBin; b += 1) histogram[b] += perBin;
}

/** Build a volume profile with POC, a 70% value area, and high/low volume nodes. */
export function buildVolumeProfile(
  candles: ProfileCandle[],
  bins = 50,
  valueAreaPct = 0.7,
): VolumeProfile {
  if (!candles.length) return { ...EMPTY_PROFILE };

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  if (!(maxPrice > minPrice)) return { ...EMPTY_PROFILE };

  const binSize = (maxPrice - minPrice) / bins;
  const histogram = new Array(bins).fill(0);
  for (const candle of candles) accumulate(histogram, candle, minPrice, binSize, bins);

  const totalVolume = histogram.reduce((a, b) => a + b, 0);
  if (totalVolume <= 0) return { ...EMPTY_PROFILE };

  const binPrice = (index: number) => minPrice + (index + 0.5) * binSize;

  let pocIdx = 0;
  for (let i = 1; i < bins; i += 1) {
    if (histogram[i] > histogram[pocIdx]) pocIdx = i;
  }

  // Grow the value area outward from the POC, always taking the heavier adjacent bin.
  const target = totalVolume * valueAreaPct;
  let accumulated = histogram[pocIdx];
  let lo = pocIdx;
  let hi = pocIdx;
  while (accumulated < target && (lo > 0 || hi < bins - 1)) {
    const below = lo > 0 ? histogram[lo - 1] : -1;
    const above = hi < bins - 1 ? histogram[hi + 1] : -1;
    if (above >= below) {
      hi += 1;
      accumulated += histogram[hi];
    } else {
      lo -= 1;
      accumulated += histogram[lo];
    }
  }

  const mean = totalVolume / bins;
  const nodes: VolumeNode[] = histogram.map((volume, i) => ({
    price: round6(binPrice(i)) as number,
    volume: round6(volume) as number,
    share: round6(volume / totalVolume) as number,
  }));

  // HVN: meaningfully above average and a local peak. LVN: meaningfully below average and a
  // local trough. Requiring a local extremum stops a broad plateau reporting every bin as a node.
  const isPeak = (i: number) =>
    histogram[i] >= (histogram[i - 1] ?? -Infinity) && histogram[i] >= (histogram[i + 1] ?? -Infinity);
  const isTrough = (i: number) =>
    histogram[i] <= (histogram[i - 1] ?? Infinity) && histogram[i] <= (histogram[i + 1] ?? Infinity);

  const hvn = nodes
    .filter((_, i) => histogram[i] > mean * 1.5 && isPeak(i))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);
  const lvn = nodes
    .filter((_, i) => histogram[i] < mean * 0.4 && isTrough(i) && histogram[i] > 0)
    .sort((a, b) => a.volume - b.volume)
    .slice(0, 5);

  return {
    poc: round6(binPrice(pocIdx)),
    val: round6(minPrice + lo * binSize),
    vah: round6(minPrice + (hi + 1) * binSize),
    hvn,
    lvn,
    binSize: round6(binSize),
    totalVolume: round6(totalVolume) as number,
  };
}

/** Split candles into fixed-length sessions, oldest first. */
function chunkSessions(candles: ProfileCandle[], sessionBars: number): ProfileCandle[][] {
  const sessions: ProfileCandle[][] = [];
  for (let i = 0; i < candles.length; i += sessionBars) {
    sessions.push(candles.slice(i, i + sessionBars));
  }
  return sessions;
}

/**
 * Prior-session points of control that price has not returned to.
 *
 * An untested POC marks a price where heavy two-sided trade occurred and then price left without
 * revisiting. Those levels tend to attract price later, which makes them useful targets — and
 * useful warnings when one sits between an entry and its intended target.
 */
export function findNakedPocs(
  candles: ProfileCandle[],
  sessionBars = 24,
  maxResults = 5,
): NakedPoc[] {
  const sessions = chunkSessions(candles, sessionBars);
  if (sessions.length < 2) return [];

  const naked: NakedPoc[] = [];

  // Skip the final (still forming) session — its POC has not had a chance to be tested.
  for (let s = 0; s < sessions.length - 1; s += 1) {
    const profile = buildVolumeProfile(sessions[s], 30);
    if (profile.poc == null) continue;

    const startIndex = (s + 1) * sessionBars;
    let tested = false;
    for (let i = startIndex; i < candles.length; i += 1) {
      if (candles[i].low <= profile.poc && candles[i].high >= profile.poc) {
        tested = true;
        break;
      }
    }
    if (tested) continue;

    const lastBarOfSession = sessions[s][sessions[s].length - 1];
    naked.push({
      price: profile.poc,
      sessionIndex: s,
      time: lastBarOfSession?.time ?? null,
      barsAgo: candles.length - 1 - (startIndex - 1),
    });
  }

  // Most recent untested POCs are the most relevant.
  return naked.sort((a, b) => a.barsAgo - b.barsAgo).slice(0, maxResults);
}

export function buildVolumeProfileResult(
  candles: ProfileCandle[],
  options: { bins?: number; sessionBars?: number } = {},
): VolumeProfileResult {
  const bins = options.bins ?? 50;
  const sessionBars = options.sessionBars ?? 24;

  const sessions = chunkSessions(candles, sessionBars);
  const lastSession = sessions[sessions.length - 1];

  return {
    composite: buildVolumeProfile(candles, bins),
    developing: lastSession?.length ? buildVolumeProfile(lastSession, Math.min(bins, 30)) : null,
    nakedPocs: findNakedPocs(candles, sessionBars),
  };
}

export type ValueAreaRelation = "above_value" | "in_value" | "below_value" | "unknown";

/**
 * Where price sits relative to the value area. Outside value is where trend continuation and
 * mean-reversion setups diverge most sharply, so it is worth stating explicitly.
 */
export function classifyValueAreaRelation(price: number | null, profile: VolumeProfile): ValueAreaRelation {
  if (price == null || profile.vah == null || profile.val == null) return "unknown";
  if (price > profile.vah) return "above_value";
  if (price < profile.val) return "below_value";
  return "in_value";
}
