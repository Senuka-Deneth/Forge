export const educationData = [
  {
    category: "Price & Market",
    items: [
      {
        id: "last-price",
        tag: "Market Data",
        title: "Last Price",
        subtitle: "Current Trading Price",
        whatIsIt: "The Last Price is the price at which the most recent trade occurred on the Binance exchange for the selected symbol.",
        howToRead: "It is displayed as a numeric value and updates in real time when the WebSocket connection is active.",
        howToUse: "This is your baseline reference. Indicators, AI analysis, pivots, and confluence levels are all anchored to this price.",
        visualHtml: `<div class="formula-box">Example: $64,250.50</div>
          <div class="edu-tips">
<div class="edu-tip info">Displayed at the top of the dashboard for quick reference.</div>
</div>`
      },
      {
        id: "price-change",
        tag: "Market Data",
        title: "Price Change",
        subtitle: "Percentage Change",
        whatIsIt: "Price Change shows the percentage difference between the current last price and the previous candle close on your selected timeframe.",
        howToRead: "Green means price is up versus the prior close; red means it is down. Magnitude tells you how fast the move is, not whether it will continue.",
        howToUse: "Use it as a quick sentiment read, then confirm with volume and structure. A large move on thin volume is weaker than the same move on heavy participation.",
        visualHtml: `<div class="formula-box">((Current Price − Previous Close) / Previous Close) × 100</div>
          <div class="edu-tips">
<div class="edu-tip bull">+2.45% — price has increased</div>
<div class="edu-tip bear">−1.20% — price has decreased</div>
</div>`
      },
      {
        id: "volume",
        tag: "Market Data",
        title: "Volume",
        subtitle: "Trading Volume",
        whatIsIt: "Volume is the total amount of the asset traded during the current candle period on Binance spot.",
        howToRead: "Higher bars mean more activity. Forge also computes relative volume (current bar vs its 20-bar average) to flag unusual participation.",
        howToUse: "Volume confirms or questions price. Breakouts and trend legs that expand on rising volume are more trustworthy than moves that happen on declining volume.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">High volume — stronger conviction in the move.</div>
<div class="edu-tip neutral">Low volume — weak conviction; reversals and false breaks are more common.</div>
</div>`
      },
      {
        id: "relative-volume",
        tag: "Market Data",
        title: "Relative Volume",
        subtitle: "Participation vs Average",
        whatIsIt: "Relative volume compares the current candle volume to the simple average of the last 20 bars. A value of 2.0 means twice the usual activity.",
        howToRead: "Read it as a multiplier, not an absolute number. Values near 1.0 are normal; sustained readings above ~1.5 suggest institutional or event-driven flow.",
        howToUse: "Pair it with the move direction. Bullish structure plus RVOL > 1.5 on up bars is constructive; the same RVOL on a breakdown warns of real selling, not a liquidity vacuum.",
        visualHtml: `<div class="formula-box">RVOL = Current Volume / SMA(Volume, 20)</div>
          <div class="edu-tips">
<div class="edu-tip info">Forge surfaces this in the market snapshot when candles are available.</div>
</div>`
      },
      {
        id: "session-structure",
        tag: "Session Structure",
        title: "Session Ranges",
        subtitle: "Asia / London / New York",
        whatIsIt: "Forge buckets intraday candles into simplified UTC session windows (Asia, London, New York) and tracks each session high/low. Overlapping London–New York hours update both buckets.",
        howToRead: "Developing sessions are still forming; completed sessions are fixed ranges. On daily+ timeframes this is intentionally empty because one bar spans multiple sessions.",
        howToUse: "Use session highs/lows as intraday magnets and breakout references. A London breakout that holds into New York reads differently from the same print during thin Asia hours.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Session boundaries are conventions, not exchange rules — treat them as liquidity context, not prophecy.</div>
</div>`
      },
      {
        id: "cme-gap",
        tag: "Session Structure",
        title: "CME Gap",
        subtitle: "Weekend Futures Dislocation",
        whatIsIt: "The CME gap measures the space between Friday CME BTC futures close and Monday open. Forge tracks unfilled gaps as potential magnet levels in confluence.",
        howToRead: "A gap above price is often described as overhead; below as support magnet. Filled gaps are removed from the active level set.",
        howToUse: "Gaps are imperfect in 24/7 crypto but still matter because many funds mark risk to CME. Use them as confluence, not as standalone entries.",
        visualHtml: `<div class="formula-box">Gap zone between Friday close and Monday open</div>
          <div class="edu-tips">
<div class="edu-tip info">Shown in AI context and confluence when unfilled.</div>
</div>`
      }
    ]
  },
  {
    category: "Trend",
    items: [
      {
        id: "ema",
        tag: "Trend",
        title: "EMA 20 & 50",
        subtitle: "Exponential Moving Averages",
        whatIsIt: "EMAs weight recent closes more heavily than a simple average. Forge uses 20-period (short) and 50-period (medium) on the primary chart and in multi-timeframe reads.",
        howToRead: "Price above both EMAs with the 20 above the 50 suggests bullish structure; the mirror image is bearish. Flat, intertwined EMAs usually mean range conditions.",
        howToUse: "Use EMAs for bias and pullback zones in trends, not as magic lines. A close back through the 20 after a breakout failure is often the first sign momentum stalled.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">Price > EMA 20 > EMA 50 — bullish stack</div>
<div class="edu-tip bear">Price < EMA 20 < EMA 50 — bearish stack</div>
</div>`
      },
      {
        id: "adx-di",
        tag: "Trend",
        title: "ADX & DI",
        subtitle: "Trend Strength vs Direction",
        whatIsIt: "+DI and −DI show which side of the range is winning; ADX measures how strong that edge is regardless of direction. Forge uses 14-period Wilder settings.",
        howToRead: "Rising ADX with +DI above −DI is a strengthening uptrend. High ADX with flat or falling slope means the trend is mature, not necessarily reversing.",
        howToUse: "ADX answers \"is there a trend worth trading?\" — not \"which way.\" Pair ADX with structure: continuation setups need ADX ≥ 25 and agreement on higher timeframes.",
        visualHtml: `<div class="formula-box">ADX > 25 and rising → trending regime candidate</div>
          <div class="edu-tips">
<div class="edu-tip info">Regime gating in Forge uses ADX together with band compression and ATR percentile.</div>
</div>`
      },
      {
        id: "supertrend",
        tag: "Trend",
        title: "Supertrend",
        subtitle: "ATR Trailing Stop",
        whatIsIt: "Supertrend is an ATR-based trailing stop line that flips when price closes through it. It is a trend-following overlay, not a mean-reversion tool.",
        howToRead: "Green/bullish when price holds above the line; bearish when below. Whipsaws are common in ranges — that is the indicator working as designed, not failing.",
        howToUse: "Use it to stay with momentum once structure already agrees. Do not fade Supertrend flips in volatile chop; wait for regime to shift to trending.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Available on the chart overlay and in the volatility feature block.</div>
</div>`
      },
      {
        id: "ichimoku",
        tag: "Trend",
        title: "Ichimoku Cloud",
        subtitle: "Multi-Component Trend System",
        whatIsIt: "Ichimoku combines conversion/base lines, the cloud (senkou span A/B), and lagging span into one trend framework. Forge computes the standard 9/26/52 settings on the chart overlay.",
        howToRead: "Price above a thick, rising cloud is bullish; below a falling cloud is bearish. Thin or twisted clouds signal transition, not clean trend.",
        howToUse: "Treat the cloud as a filter: long ideas are higher quality when price is above cloud and Tenkan > Kijun. Conflicting cloud and EMA stack is a stand-aside signal.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Kumo thickness approximates trend quality — thin clouds break easily.</div>
</div>`
      },
      {
        id: "donchian",
        tag: "Trend",
        title: "Donchian Channels",
        subtitle: "Breakout Envelope",
        whatIsIt: "Donchian channels plot the highest high and lowest low over N bars (20 by default), with a midline between them. They define the recent trading range.",
        howToRead: "Closes at the upper band signal range expansion upward; at the lower band, expansion downward. Midline often acts as mean in ranges.",
        howToUse: "Breakout traders watch closes outside the channel; mean-reversion traders fade extremes back toward mid. Forge also uses Donchian mid in TTM squeeze baseline math.",
        visualHtml: `<div class="formula-box">Upper = Highest High(N); Lower = Lowest Low(N)</div>`
      },
      {
        id: "hurst",
        tag: "Trend",
        title: "Hurst Exponent",
        subtitle: "Trend vs Mean-Reversion Tendency",
        whatIsIt: "Hurst estimates whether recent returns behave more like a trending series (H > 0.5) or a mean-reverting one (H < 0.5). Forge computes it from rescaled-range statistics on log returns.",
        howToRead: "Values near 0.5 are essentially random walk. Persistent readings above ~0.55 favour continuation strategies; below ~0.45 favour range fades.",
        howToUse: "Use Hurst as context for which playbook fits today — not as an entry trigger. A high Hurst day is a bad day to sell every RSI overbought tick.",
        visualHtml: `<div class="formula-box">H ≈ 0.5 → random; H > 0.5 → persistence; H < 0.5 → anti-persistence</div>`
      }
    ]
  },
  {
    category: "Momentum",
    items: [
      {
        id: "rsi",
        tag: "Momentum",
        title: "RSI 14",
        subtitle: "Relative Strength Index",
        whatIsIt: "RSI measures the speed and magnitude of recent price changes on a 0–100 scale. Forge uses 14-period Wilder RSI on the primary and multi-timeframe panels.",
        howToRead: "Above 70 is traditionally overbought; below 30 oversold. In strong trends RSI can stay extreme for long stretches — context matters more than fixed levels.",
        howToUse: "Best used with structure: oversold in an uptrend is a pullback buy candidate; overbought in a downtrend is a bounce sell. RSI divergence is covered separately.",
        visualHtml: `<div class="scale-bar"><div class="zone oversold" style="width:30%">0–30 Oversold</div><div class="zone neutral-zone" style="width:40%">30–70 Neutral</div><div class="zone overbought" style="width:30%">70–100 Overbought</div></div>
          <div class="edu-tips">
<div class="edu-tip bull">RSI < 30 in uptrend — pullback, not automatic bottom</div>
<div class="edu-tip bear">RSI > 70 in downtrend — bounce, not automatic top</div>
</div>`
      },
      {
        id: "stoch-rsi",
        tag: "Momentum",
        title: "Stochastic RSI",
        subtitle: "RSI of RSI",
        whatIsIt: "Stoch RSI applies the stochastic oscillator to RSI values, producing a faster, more sensitive momentum read. Forge exposes %K and %D on the chart overlay.",
        howToRead: "Extremes near 0 or 1 flag compressed momentum; crossovers of %K and %D hint at short-term turns. It will false-signal in chop more often than plain RSI.",
        howToUse: "Use for timing within a setup you already like — not to invent bias. A bullish structure plus Stoch RSI curling up from oversold is timing; Stoch RSI alone is noise.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">%K crossing above %D from below 0.2 — short-term bullish impulse (verify on structure).</div>
</div>`
      },
      {
        id: "macd",
        tag: "Momentum",
        title: "MACD",
        subtitle: "Moving Average Convergence Divergence",
        whatIsIt: "MACD plots the difference between 12- and 26-period EMAs, a 9-period signal line, and a histogram of their gap. It blends trend and momentum.",
        howToRead: "MACD above signal with rising histogram = strengthening bullish momentum. Crosses below signal warn momentum is fading even if price still looks fine.",
        howToUse: "Histogram slope often turns before price. Forge uses MACD in signal agreement and in divergence detection against swing highs/lows.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">MACD line > signal — bullish momentum</div>
<div class="edu-tip bear">MACD line < signal — bearish momentum</div>
</div>`
      },
      {
        id: "divergence",
        tag: "Momentum",
        title: "Divergence",
        subtitle: "When Momentum Disagrees With Price",
        whatIsIt: "Divergence is when price makes a higher high but RSI or MACD histogram makes a lower high (bearish), or price makes a lower low while the oscillator makes a higher low (bullish).",
        howToRead: "Forge only flags divergence when there are at least two confirmed swing points to compare — a single wick does not qualify. Unconfirmed swings are ignored on purpose.",
        howToUse: "Valid divergence weakens the prevailing move; it does not time the exact turn. Wait for structure break or reclaim before acting — divergence without confirmation is just warning.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Bearish: HH in price + LH in oscillator. Bullish: LL in price + HL in oscillator.</div>
<div class="edu-tip info">No second swing → no divergence flag in Forge.</div>
</div>`
      }
    ]
  },
  {
    category: "Volatility",
    items: [
      {
        id: "atr",
        tag: "Volatility",
        title: "ATR 14",
        subtitle: "Average True Range",
        whatIsIt: "ATR is the average of true range over 14 bars (Wilder). Forge also shows ATR as a percentage of price so you can compare volatility across symbols.",
        howToRead: "Rising ATR means wider candles and larger stop distances; falling ATR means compression. Absolute ATR scales with price — use ATR% for cross-asset comparison.",
        howToUse: "Size stops and targets from ATR, not round numbers. Forge uses ATR for invalidation proximity, inflection thresholds, and liquidity pool clustering.",
        visualHtml: `<div class="formula-box">ATR% = ATR / Close × 100</div>`
      },
      {
        id: "bollinger",
        tag: "Volatility",
        title: "Bollinger Bands",
        subtitle: "Volatility Envelope",
        whatIsIt: "Bollinger Bands place a 20-period SMA midline with ±2 standard deviation envelopes. %B shows where price sits inside the band; bandwidth measures how wide the envelope is.",
        howToRead: "Squeezed bandwidth (low percentile) precedes expansion; walking the upper band in trends is normal, not automatically \"overbought.\"",
        howToUse: "Use bands for volatility context: fades near extremes in ranges, breakouts when bandwidth expands from compression. Regime detection uses bandwidth percentile.",
        visualHtml: `<div class="formula-box">%B = (Price − Lower) / (Upper − Lower)</div>`
      },
      {
        id: "keltner",
        tag: "Volatility",
        title: "Keltner Channels",
        subtitle: "ATR-Based Envelope",
        whatIsIt: "Keltner channels use an EMA midline with ATR-scaled upper and lower bands (20/20/1.5 default). They track trend with a volatility buffer unlike Bollinger std-dev bands.",
        howToRead: "When Bollinger bands sit entirely inside Keltner channels, the TTM squeeze is on — volatility compression. Expansion after squeeze is the tradable event.",
        howToUse: "Compare Keltner to Bollinger for squeeze detection. Price riding the upper Keltner in a trend is healthy; repeated pierces without follow-through signal chop.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Squeeze = BB inside KC — see TTM Squeeze topic.</div>
</div>`
      },
      {
        id: "ttm-squeeze",
        tag: "Volatility",
        title: "TTM Squeeze",
        subtitle: "Compression Before Expansion",
        whatIsIt: "The TTM squeeze fires when Bollinger Bands contract inside Keltner Channels, signalling compressed volatility. Forge labels states: squeeze, fired, expanded.",
        howToRead: "Momentum histogram direction hints which way expansion may resolve — but direction is probabilistic, not guaranteed. Long squeezes that fire into chop still fail.",
        howToUse: "Do not trade the squeeze itself; trade the breakout with structure. Forge counts consecutive squeeze bars so you can see how coiled the market is.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip neutral">Squeeze on — stand by</div>
<div class="edu-tip bull">Fired with rising momentum — bullish expansion candidate</div>
</div>`
      },
      {
        id: "realized-vol",
        tag: "Volatility",
        title: "Realized Volatility",
        subtitle: "Historical Standard Deviation",
        whatIsIt: "Realized vol annualises the standard deviation of recent log returns over a rolling window. It answers how much price actually moved, not how much options imply.",
        howToRead: "Compare current realised vol to its own recent percentile. Spikes often follow shocks; sustained elevation means wider stops and smaller size are mandatory.",
        howToUse: "Use alongside ATR: ATR is bar-range based; realised vol is close-to-close statistical vol. Both rising together confirms a high-vol regime.",
        visualHtml: `<div class="formula-box">σ_annual ≈ stdev(log returns) × √periods_per_year</div>`
      },
      {
        id: "volatility-regime",
        tag: "Volatility",
        title: "Volatility Regime",
        subtitle: "Compression vs Expansion",
        whatIsIt: "Forge classifies volatility using ATR percentile vs its recent history and Bollinger bandwidth percentile. This feeds the broader market regime (trending / ranging / volatile chop).",
        howToRead: "Top-quintile ATR with weak ADX maps to volatile chop — big candles, no direction. Compressed bands with weak ADX suggest ranging conditions.",
        howToUse: "Regime decides which setups Forge will even propose. Do not force breakout plays in chop or fade plays in strong trends without edge-specific evidence.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bear">Volatile chop — Forge may return WAIT</div>
<div class="edu-tip neutral">Ranging — fade edges near real S/R only</div>
</div>`
      }
    ]
  },
  {
    category: "Volume & Order Flow",
    items: [
      {
        id: "obv",
        tag: "Order Flow",
        title: "OBV",
        subtitle: "On-Balance Volume",
        whatIsIt: "OBV adds volume on up closes and subtracts on down closes, building a cumulative participation line. It approximates whether volume is flowing with buyers or sellers.",
        howToRead: "Rising OBV with rising price confirms the trend. Flat or falling OBV under new highs warns the move lacks broad participation.",
        howToUse: "OBV is relative — compare slope and structure, not absolute level. Divergence between price and OBV is a warning, not a timed reversal.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">OBV making higher highs with price — healthy uptrend participation.</div>
</div>`
      },
      {
        id: "cvd",
        tag: "Order Flow",
        title: "CVD",
        subtitle: "Cumulative Volume Delta",
        whatIsIt: "CVD accumulates per-bar taker buy minus taker sell volume using Binance taker-buy fields. It tracks aggressive order flow, not passive limit adds.",
        howToRead: "Rising CVD means aggressive buyers dominate; falling CVD means aggressive sellers. Sharp CVD drops into support can mark capitulation or real selling — context decides.",
        howToUse: "Compare CVD trend to price trend. Price up + CVD down is distribution-like; price flat + CVD up can precede breakout if resting offers get lifted.",
        visualHtml: `<div class="formula-box">Bar delta = 2 × TakerBuyVolume − Volume</div>`
      },
      {
        id: "spot-perp-divergence",
        tag: "Order Flow",
        title: "Spot vs Perp Divergence",
        subtitle: "Cash vs Leveraged Flow",
        whatIsIt: "When spot CVD trends differently from perpetuals taker flow, leverage may be driving price without cash confirmation (or vice versa). Forge surfaces both where futures data exists.",
        howToRead: "Perp-led rallies with flat spot CVD are fragile — funding and liquidations can unwind them quickly. Spot-led moves with perp lagging often have better follow-through.",
        howToUse: "Treat divergence as a quality filter on breakouts. If you are long, you want spot participation confirming, not only perp speculation.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Null futures fields mean data was unavailable — Forge says so rather than guessing.</div>
</div>`
      },
      {
        id: "order-book-imbalance",
        tag: "Order Flow",
        title: "Order Book Imbalance",
        subtitle: "Bid vs Ask Pressure",
        whatIsIt: "OBI measures quote notional within ±1% of mid on bid vs ask. Positive = more resting buy interest; negative = more sell interest. It is a snapshot, not a forecast.",
        howToRead: "Extreme positive OBI can mean support below — or a wall that gets pulled. Read changes across refreshes, not one frozen frame.",
        howToUse: "Use OBI for execution quality and short-term bias. Persistent sell-side imbalance into resistance adds confluence for fade setups; do not front-run walls blindly.",
        visualHtml: `<div class="formula-box">OBI ∈ [−1, +1] from ±1% depth</div>`
      },
      {
        id: "book-slope",
        tag: "Order Flow",
        title: "Book Slope",
        subtitle: "Depth Cost to Move Price",
        whatIsIt: "Book slope estimates quote currency required to move mid price by 1% on bid and ask sides. Steep ask slope means offers are thin above — price can jump on modest buying.",
        howToRead: "Asymmetric slope (steep one side, deep the other) hints which direction is easier to push short term. It is microstructure, not a daily bias tool.",
        howToUse: "Forge uses slope in thin-book guardrails. Wide spread plus shallow depth can block TAKE verdicts until you accept execution risk via override.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Thin ask slope + breakout long = slippage risk — size down or use limits.</div>
</div>`
      },
      {
        id: "resting-walls",
        tag: "Order Flow",
        title: "Resting Walls",
        subtitle: "Large Limit Clusters",
        whatIsIt: "Walls are the largest resting orders within the deep order book bands Forge scans. They act as temporary support/resistance until filled or pulled.",
        howToRead: "A wall on the bid can slow selloffs; a wall on the ask caps rallies. Spoofing exists — walls that vanish as price approaches were never real liquidity.",
        howToUse: "Use walls for target placement and stop awareness, not as guaranteed reversal points. Confluence with pivot or VP level makes a wall more meaningful.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Largest bid/ask notional within scanned depth bands.</div>
</div>`
      }
    ]
  },
  {
    category: "Market Structure",
    items: [
      {
        id: "swings",
        tag: "Structure",
        title: "Swing Points",
        subtitle: "Fractal Highs and Lows",
        whatIsIt: "Swings are local extremes confirmed by N bars on each side (fractal wing). Forge uses them for BOS/CHoCH, S/R zones, divergence, and liquidity pools.",
        howToRead: "The most recent swings are labelled HH/HL/LH/LL versus the prior swing of the same type. Unconfirmed bars near the right edge never qualify — swings are hindsight-confirmed.",
        howToUse: "Trade from the last meaningful swing, not every minor wick. Higher-timeframe swings outweigh lower-timeframe noise for bias and invalidation.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">HH + HL sequence → uptrend bias; LH + LL → downtrend bias.</div>
</div>`
      },
      {
        id: "bos-choch",
        tag: "Structure",
        title: "BOS & CHoCH",
        subtitle: "Break of Structure",
        whatIsIt: "Break of Structure (BOS) is a close through the last significant swing in the trend direction — continuation. Change of Character (CHoCH) is the first break against the prevailing sequence — potential reversal.",
        howToRead: "Forge flags bullish BOS on close above last swing high and bearish BOS below last swing low. CHoCH is the same mechanics but against prior HH/HL or LH/LL context.",
        howToUse: "Wait for a close, not a wick. A sweep that reclaims is different from a BOS — see liquidity sweeps. Use BOS for continuation entries; CHoCH for regime shift awareness.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">Close > last swing high — bullish BOS</div>
<div class="edu-tip bear">Close < last swing low — bearish BOS</div>
</div>`
      },
      {
        id: "sr-zones",
        tag: "Structure",
        title: "Support & Resistance Zones",
        subtitle: "Clustered Reaction Areas",
        whatIsIt: "S/R zones cluster nearby swing reactions into scored bands with touch counts. Nearest support/resistance to price are surfaced for trade planning and signal agreement.",
        howToRead: "Higher touch count and recency raise zone score. Zones are areas, not lines — expect wicks through the band before acceptance or rejection.",
        howToUse: "Forge requires ranging-regime fades to be within ~0.5 ATR of a real zone. Random mid-range entries are filtered out by regime gating.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Nearest support below price; nearest resistance above — used in AI trade geometry.</div>
</div>`
      },
      {
        id: "eqh-eql",
        tag: "Structure",
        title: "Equal Highs / Lows",
        subtitle: "Stop Pools",
        whatIsIt: "Equal highs (EQH) and equal lows (EQL) are swing clusters within a tolerance band (~0.4 ATR). They mark where resting stops and breakout orders tend to pile up.",
        howToRead: "Buy-side liquidity sits above EQH (short stops + breakout buys); sell-side below EQL. More touches = thicker pool, not a precise tick.",
        howToUse: "Do not park your stop exactly at obvious EQ levels — you are the liquidity. Expect sweeps through pools before the \"real\" move.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Unswept pools listed in AI context; swept pools are historical.</div>
</div>`
      },
      {
        id: "liquidity-sweeps",
        tag: "Structure",
        title: "Liquidity Sweeps",
        subtitle: "Stop Runs and Reclaims",
        whatIsIt: "A sweep is price trading through a liquidity pool then reversing — taking resting stops before moving the other way. Forge marks pools as swept once price trades through.",
        howToRead: "Sweep + reclaim (wick through, close back inside) is a reversal signature. Sweep + acceptance (close beyond) is continuation through the level.",
        howToUse: "Favour trades that enter after the sweep narrative is clear, not while stops are still being run. Reclaimed sweeps of EQH/EQL are higher quality than blind breakouts.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">A reclaimed sweep of sell-side liquidity below EQL can fuel a long — if structure confirms.</div>
</div>`
      },
      {
        id: "fvgs",
        tag: "Structure",
        title: "Fair Value Gaps",
        subtitle: "Imbalance Zones",
        whatIsIt: "FVGs are three-candle gaps where the middle candle leaves an unfilled range between candle 1 high/low and candle 3 low/high. They represent inefficient pricing.",
        howToRead: "Bullish FVGs sit below price as potential support on retest; bearish above as resistance. Partial fills are common; full fill often ends the gap thesis.",
        howToUse: "Use FVGs as entry refinement inside a higher-timeframe bias. An unfilled bullish FVG under support confluence is a better long limit than mid-air.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Forge includes active FVGs in liquidity map context for the AI snapshot.</div>
</div>`
      },
      {
        id: "order-blocks",
        tag: "Structure",
        title: "Order Blocks",
        subtitle: "Last Opposing Candle Before Impulse",
        whatIsIt: "Order blocks approximate the final opposing candle before a displacement move — where institutional orders may have been placed. Bullish OB is the last down candle before a strong up leg.",
        howToRead: "Price returning to an untested OB often reacts; mitigated blocks (already revisited) are weaker. This is a model, not exchange-reported data.",
        howToUse: "Combine OB with structure: bullish OB in an uptrend after CHoCH is higher quality than random OB in chop. Size smaller when OB is far from current price.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Treat OB as confluence zones, not guaranteed reversals.</div>
</div>`
      }
    ]
  },
  {
    category: "Volume Profile",
    items: [
      {
        id: "poc",
        tag: "Volume Profile",
        title: "POC",
        subtitle: "Point of Control",
        whatIsIt: "The POC is the price bin with the highest traded volume in the profile window. It is where the market spent the most time transacting — a fair-value magnet.",
        howToRead: "Price above POC suggests acceptance higher; below suggests acceptance lower. Returning to POC from either side often slows momentum as two-sided trade resumes.",
        howToUse: "Use POC for mean-reversion targets in ranges and for judging whether breakouts are accepted (hold above prior POC) or rejected.",
        visualHtml: `<div class="formula-box">POC = argmax(volume at price bins)</div>`
      },
      {
        id: "vah-val",
        tag: "Volume Profile",
        title: "VAH & VAL",
        subtitle: "Value Area Bounds",
        whatIsIt: "Value Area High and Low bracket the price range containing ~70% of session volume (configurable logic in profile builder). Inside value = balanced; outside = exploration.",
        howToRead: "Breakouts above VAH or below VAL signal initiative activity. Re-entries back inside value after a failed breakout are fade setups in ranging regimes.",
        howToUse: "Forge classifies whether price is inside, above, or below value for the AI snapshot. Pair with regime: fades need ranging; breakouts need trending.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Developing session value area updates bar by bar on intraday charts.</div>
</div>`
      },
      {
        id: "hvn-lvn",
        tag: "Volume Profile",
        title: "HVN & LVN",
        subtitle: "High / Low Volume Nodes",
        whatIsIt: "High Volume Nodes (HVN) are bins where volume clusters — price tends to stall and rotate. Low Volume Nodes (LVN) are thin bins price travels through quickly.",
        howToRead: "LVNs act like air pockets — fast moves through them, pauses at HVNs. Overnight gaps into LVNs often extend until the next HVN.",
        howToUse: "Place partial targets at HVNs; expect friction. Stops beyond LVN reduce whipsaw but increase distance — size accordingly.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">HVN = shelf; LVN = gap in the profile.</div>
</div>`
      },
      {
        id: "naked-poc",
        tag: "Volume Profile",
        title: "Naked POC",
        subtitle: "Untested Prior POC",
        whatIsIt: "A naked POC is a prior session point of control that price has not traded back to since it formed. Untested POCs often draw price like open magnets.",
        howToRead: "Forge tracks how many bars ago the POC formed. Fresher naked POCs tend to matter more than very old ones in fast markets.",
        howToUse: "Use as confluence for targets and limit entries, not as sole reason to trade. A naked POC aligned with pivot or VWAP is stronger.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Listed in volume profile result when prior session POC remains untested.</div>
</div>`
      },
      {
        id: "developing-value-area",
        tag: "Volume Profile",
        title: "Developing Value Area",
        subtitle: "Live Session Profile",
        whatIsIt: "The developing profile rebuilds the current session volume distribution bar by bar. POC and value area shift as new volume prints — they are not fixed until the session matures.",
        howToRead: "Early-session POC is unreliable; late-session POC is more meaningful. Watch POC migration: rising POC in an uptrend shows acceptance climbing.",
        howToUse: "Intraday traders use developing VA for bias; swing traders care more about composite or prior session profiles.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Composite profile spans the analysis window; developing is the active session only.</div>
</div>`
      }
    ]
  },
  {
    category: "VWAP",
    items: [
      {
        id: "session-vwap",
        tag: "VWAP",
        title: "Session VWAP",
        subtitle: "Volume-Weighted Average Price",
        whatIsIt: "Session VWAP is the cumulative (typical price × volume) / volume, resetting at each UTC day boundary on the primary series. It is the institutional intraday fair price.",
        howToRead: "Price above VWAP means buyers paid premium on average today; below means discount. Mean-reversion desks often defend VWAP on pullbacks in trends.",
        howToUse: "Use session VWAP for intraday bias on sub-daily charts. On daily+ charts the reset matters less — anchored VWAP is usually more relevant.",
        visualHtml: `<div class="formula-box">VWAP = Σ(TP × Vol) / Σ(Vol), TP = (H+L+C)/3</div>`
      },
      {
        id: "anchored-vwap",
        tag: "VWAP",
        title: "Anchored VWAP",
        subtitle: "Event-Anchored Fair Value",
        whatIsIt: "Anchored VWAP starts cumulation from a chosen anchor bar — swing low, earnings gap, major high, etc. Forge builds multiple anchors from significant structure points.",
        howToRead: "Each anchor tells a different story: VWAP from swing low tracks markup fair value; from distribution high tracks rebound supply. Compare price to several anchors for confluence.",
        howToUse: "When price stretches far above all anchored VWAPs, mean reversion risk rises — not an automatic short, but a sizing and target consideration.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Multiple anchors may be active — read relation labels in context.</div>
</div>`
      },
      {
        id: "vwap-bands",
        tag: "VWAP",
        title: "VWAP Bands",
        subtitle: "Deviation Envelopes",
        whatIsIt: "VWAP bands offset standard deviation (or ATR-scaled distance) from VWAP, similar in spirit to Bollinger bands but centred on volume fair price.",
        howToRead: "Touches of upper band in strong trends can mark continuation extremes; in ranges, band extremes are fade zones back toward VWAP.",
        howToUse: "Read band walks as trend strength. Repeated closes outside upper band with rising CVD is trend; repeated failures at band with falling RSI is exhaustion.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Band math is computed in the VWAP module alongside anchor relations.</div>
</div>`
      },
      {
        id: "anchor-selection",
        tag: "VWAP",
        title: "Anchor Selection",
        subtitle: "Which Anchor Matters",
        whatIsIt: "Not every swing deserves an anchor. Forge picks anchors from significant structure events so VWAP lines stay interpretable rather than cluttered.",
        howToRead: "Prefer anchors at clear regime shifts: major swing low after capitulation, breakdown bar, or multi-touch level. Recent anchors outweigh ancient ones in fast markets.",
        howToUse: "If two anchors disagree, trust the one aligned with higher-timeframe trend and live order flow. Conflicting VWAPs are a stand-aside signal.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">classifyVwapRelation tells the AI whether price is above/below each active anchor.</div>
</div>`
      }
    ]
  },
  {
    category: "Derivatives",
    items: [
      {
        id: "funding-zscore",
        tag: "Derivatives",
        title: "Funding Z-Score",
        subtitle: "Perp Crowding",
        whatIsIt: "Funding rate z-score measures how extreme the current perpetual funding is versus its recent distribution. High positive z = longs paying aggressively (long crowded).",
        howToRead: "Forge labels crowding long_crowded / short_crowded / neutral at ±1.5σ. Extreme funding does not time tops — crowded trades can stay crowded.",
        howToUse: "Use funding as a risk filter: crowded long funding into resistance reduces long quality. Funding-window guardrails may block entries near settlement.",
        visualHtml: `<div class="formula-box">z = (latest funding − mean) / stdev</div>`
      },
      {
        id: "open-interest",
        tag: "Derivatives",
        title: "Open Interest",
        subtitle: "Outstanding Contracts",
        whatIsIt: "Open interest is total outstanding perpetual futures contracts. Forge tracks 4h/24h % change and slope over recent hourly prints from Binance futures data.",
        howToRead: "Rising OI + rising price = new longs entering (constructive in trends). Rising OI + falling price = new shorts. Falling OI on moves = short covering or long liquidation, not fresh conviction.",
        howToUse: "OI is symbol-level, not your personal book. Pair OI delta with price direction before inferring \"smart money.\"",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Null OI fields mean futures history was unavailable for that symbol.</div>
</div>`
      },
      {
        id: "long-short-ratio",
        tag: "Derivatives",
        title: "Long/Short Ratio",
        subtitle: "Taker Buy/Sell Ratio",
        whatIsIt: "Forge uses Binance taker long/short (buy/sell) ratio over recent 1h buckets — aggressive side dominance, not account positioning census.",
        howToRead: "Rising ratio means aggressive buyers dominate hourly flow; falling means sellers. Trend label compares latest vs 24h ago (rising / falling / flat).",
        howToUse: "Extreme ratios can mark exhaustion when price stops responding. Do not treat 2.0 as \"80% of traders are long\" — it is taker flow, not positioning.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Pair with CVD and funding for a fuller derivatives read.</div>
</div>`
      },
      {
        id: "basis",
        tag: "Derivatives",
        title: "Basis / Mark Premium",
        subtitle: "Spot vs Futures",
        whatIsIt: "Basis is the gap between perpetual mark (or futures) price and spot/index. Positive basis = futures trading premium (bullish positioning); negative = discount.",
        howToRead: "Forge exposes mark_basis_pct in futures and liquidation context when data exists. Sudden basis blowouts often precede volatility as arbs and liquidations interact.",
        howToUse: "Persistent premium in uptrends is normal; collapsing premium while price flat warns longs are leaving. Basis alone is not an entry signal.",
        visualHtml: `<div class="formula-box">Basis% ≈ (Mark − Index) / Index × 100</div>`
      },
      {
        id: "liquidation-clusters",
        tag: "Derivatives",
        title: "Liquidation Clusters",
        subtitle: "Estimated Stop Magnets",
        whatIsIt: "When COINGLASS_API_KEY is set, Forge fetches modelled liquidation heatmap clusters — price bands where leveraged positions may force cascade liquidations. These are estimates, not exchange truth.",
        howToRead: "Clusters above price are often cited as upside fuel (short liquidations); below as downside fuel (long liquidations). Models disagree and update frequently.",
        howToUse: "Treat clusters as scenario levels for risk management, not guaranteed targets. Without an API key, liquidation context is null and Forge states that plainly.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bear">Model estimates only — verify on chart</div>
<div class="edu-tip info">Set COINGLASS_API_KEY for heatmap data.</div>
</div>`
      }
    ]
  },
  {
    category: "Cross-Market",
    items: [
      {
        id: "btc-beta",
        tag: "Cross-Market",
        title: "BTC Beta",
        subtitle: "Amplification vs Bitcoin",
        whatIsIt: "Beta is regression slope of the symbol log returns on BTC log returns. Beta > 1 means the alt moves more than BTC; < 1 dampens BTC swings.",
        howToRead: "High-beta alts in BTC downtrends are dangerous longs regardless of local chart beauty. Forge uses beta in correlated-exposure guardrails for alt books.",
        howToUse: "Beta changes with regime — recalculate mentally after major correlation shifts. Static beta from last 30 bars is a snapshot, not a law.",
        visualHtml: `<div class="formula-box">β = Cov(r_alt, r_btc) / Var(r_btc)</div>`
      },
      {
        id: "correlation",
        tag: "Cross-Market",
        title: "BTC Correlation",
        subtitle: "Pearson on Log Returns",
        whatIsIt: "Correlation measures how closely the symbol and BTC move together over the sample window (−1 to +1). High positive correlation means BTC risk dominates.",
        howToRead: "Low correlation can mean idiosyncratic catalyst — or illiquidity noise. Check sample size; thin alts produce unstable correlations.",
        howToUse: "When correlation > ~0.7, read BTC regime before fading local signals. Forge cross-market context is skipped for BTC/ETH themselves.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Pearson on aligned log-return series.</div>
</div>`
      },
      {
        id: "dominance",
        tag: "Cross-Market",
        title: "BTC Dominance Proxy",
        subtitle: "BTC vs ETH Ratio",
        whatIsIt: "True market-cap dominance is not in Binance public API. Forge proxies with BTC close / ETH close ratio and its recent % change.",
        howToRead: "Rising ratio (btc_leading) often coincides with risk-off alt rotations; falling (alts_leading) with alt risk-on. Direction label is heuristic.",
        howToUse: "Use as macro tilt, not precision timing. Dominance shifts slowly relative to your 15m entries.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Labelled btc_leading | alts_leading | neutral in cross-market context.</div>
</div>`
      },
      {
        id: "alt-btc-breakdown",
        tag: "Cross-Market",
        title: "Alt Breakdown vs BTC",
        subtitle: "When BTC Regime Blocks Alts",
        whatIsIt: "Forge applies cross-market gating: alt longs into BTC breakdown or volatile BTC chop may be refused or discounted even if the alt chart looks clean.",
        howToRead: "btcRegime and btcTrend come from BTC higher-timeframe structure — same regime engine as primary symbol. Beta amplifies how hard BTC moves hit the alt.",
        howToUse: "If you trade alts, always glance at BTC structure first. Local perfection rarely survives BTC liquidation cascades.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Cross-market block is explicit in regime gating — not hidden in confidence.</div>
</div>`
      }
    ]
  },
  {
    category: "Risk & Decision",
    items: [
      {
        id: "risk-reward",
        tag: "Risk",
        title: "Risk / Reward",
        subtitle: "R-Multiple per Trade",
        whatIsIt: "Reward-to-risk is potential gain divided by stop distance, expressed in R. Forge computes R from entry mid, stop, and first target for the trade plan.",
        howToRead: "A 2R target means you risk 1R to make 2R. Higher R lowers the win rate you need — but only if targets are realistic, not fantasy lines.",
        howToUse: "Always measure R from your actual entry and invalidation, not from a perfect fill you will not get. Slippage and fees reduce realised R.",
        visualHtml: `<div class="formula-box">R = |Target − Entry| / |Entry − Stop|</div>`
      },
      {
        id: "position-sizing",
        tag: "Risk",
        title: "Position Sizing",
        subtitle: "Fixed Fractional Risk",
        whatIsIt: "Size so a stop hit loses a fixed % of account (commonly 0.5–2%). Forge shows the formula tying account risk to stop distance.",
        howToRead: "Wider stop ⇒ smaller position for same dollar risk. If size becomes absurdly small, the entry is too far from invalidation — wait.",
        howToUse: "Never widen the stop to justify larger size. That changes the trade thesis, not just the sizing math.",
        visualHtml: `<div class="formula-box">Size = (Account × Risk%) / |Entry − Stop|</div>`
      },
      {
        id: "expected-value",
        tag: "Risk",
        title: "Expected Value (EV)",
        subtitle: "Edge in R-Multiples",
        whatIsIt: "EV = p × R_win − (1−p) × 1 − fee_cost_R, where p is the calibrated hit rate. Positive EV means the setup pays on average over many repetitions.",
        howToRead: "Forge verdict TAKE requires positive EV with usable p. SKIP means negative EV even if the chart looks good. WAIT means no directional plan or no calibrated p.",
        howToUse: "EV is computed server-side — never trust a model prose claim of \"high probability\" over the EV row.",
        visualHtml: `<div class="formula-box">EV = p·R − (1−p)·1 − cost_R</div>`
      },
      {
        id: "breakeven-hit-rate",
        tag: "Risk",
        title: "Break-Even Hit Rate",
        subtitle: "Win% Needed to Profit",
        whatIsIt: "Break-even hit rate is the win percentage required for EV = 0 given your plan R and round-trip fees. Example: 2R target with fees might need ~34% wins, not 50%.",
        howToRead: "Compare break-even rate to calibrated hit rate. If you need 40% and history shows 35%, the setup loses long run — signal agreement cannot fix that.",
        howToUse: "Displayed on the verdict panel next to EV. Use it before every override of a SKIP verdict.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Lower R targets raise required win rate — there is no free lunch.</div>
</div>`
      },
      {
        id: "guardrails",
        tag: "Risk",
        title: "Guardrails",
        subtitle: "Hard Risk Blocks",
        whatIsIt: "Guardrails are server checks that can force WAIT/SKIP: negative EV, event blackout, funding window, daily loss limit, max open R, loss cooldown, thin book, correlated alt exposure.",
        howToRead: "Blocked guardrails show as red rows with optional Override — overrides log to risk_overrides, not silent approval. Some gates are overridable; use that deliberately.",
        howToUse: "A TAKE with zero active guardrails still requires your judgment. Guardrails prevent known foot-guns; they do not guarantee profit.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">negative_ev | event_blackout | funding_window | daily_loss_limit | max_open_r | loss_cooldown | thin_book | correlated_exposure</div>
</div>`
      },
      {
        id: "trade-management",
        tag: "Risk",
        title: "Trade Management",
        subtitle: "After Entry Plan",
        whatIsIt: "Forge builds a management plan with partial targets, stop adjustment rules, and time stop hints based on regime and plan geometry — computed deterministically, not by the model.",
        howToRead: "Management is how you harvest R without giving it all back. First target partial reduces ruin risk; trailing rules depend on volatility regime.",
        howToUse: "Follow management when you take the trade. Changing rules mid-trade without journal notes destroys calibration feedback.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Management ships with the verdict object on each analysis.</div>
</div>`
      }
    ]
  },
  {
    category: "Calibration",
    items: [
      {
        id: "brier-score",
        tag: "Calibration",
        title: "Brier Score",
        subtitle: "Probability Accuracy",
        whatIsIt: "Brier score averages (predicted_probability − outcome)² over decided trades. 0 is perfect; 0.25 is coin-flip at 50%; lower is better calibrated.",
        howToRead: "Forge computes Brier on scored predictions in the Accuracy panel. It punishes confident wrong calls more than humble wrong calls.",
        howToUse: "Track Brier over months, not days. A good system can have losing weeks but improving Brier as confidence aligns with reality.",
        visualHtml: `<div class="formula-box">Brier = mean((p̂ − y)²), y ∈ {0,1}</div>`
      },
      {
        id: "reliability-curve",
        tag: "Calibration",
        title: "Reliability Curve",
        subtitle: "Predicted vs Actual by Decile",
        whatIsIt: "Reliability buckets predictions into confidence deciles (0–10%, 10–20%, …) and plots actual hit rate vs predicted midpoint. Well-calibrated models hug the diagonal.",
        howToRead: "If the 70–80% bucket only hits 52%, you were overconfident there — Forge clamps live confidence using empirical rates to reduce repeat errors.",
        howToUse: "Use the curve to see where your edge lives. Maybe 50–60% buckets outperform — trade those setups harder; fade your own 80% stories.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Deciles computed in analysis-stats from scored ai_analysis_logs.</div>
</div>`
      },
      {
        id: "empirical-vs-model",
        tag: "Calibration",
        title: "Empirical vs Model Confidence",
        subtitle: "Clamp Logic",
        whatIsIt: "When model confidence exceeds measured hit rate for that setup×regime bucket, Forge caps it to empirical rate (or slightly above with tiny n).",
        howToRead: "Empirical rate comes from scored outcomes first; setup_baselines backfill cold start when live n is thin. Bucket label shows specificity: setup_regime > setup > global.",
        howToUse: "If you see \"capped\" behaviour, the model was more bullish than history supports. That is a feature — not a bug to override casually.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Signal agreement is separate — it is not capped because it is not a probability.</div>
</div>`
      },
      {
        id: "why-n-matters",
        tag: "Calibration",
        title: "Why n Matters",
        subtitle: "Sample Size Discipline",
        whatIsIt: "Hit rate on 7 trades is noise; on 70 it starts to mean something. Forge greys calibrated rates below ~20 decided samples in the UI.",
        howToRead: "Wilson confidence intervals widen as n shrinks — EV uses the point estimate but you should eye the uncertainty. n=12 at 75% could easily be 50% true rate.",
        howToUse: "Keep trading and journaling to grow n per setup×regime. Calibration is a marathon: every scored outcome improves the next verdict.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip neutral">Calibrated 71% (n=7) — greyed out, not actionable</div>
<div class="edu-tip bull">Calibrated 58% (n=64) — usable in EV</div>
</div>`
      },
      {
        id: "base-rates",
        tag: "Calibration",
        title: "Base Rates & Baselines",
        subtitle: "Priors Before Live Data",
        whatIsIt: "setup_baselines stores backtest-seeded hit rates per setup_type × regime × symbol × interval for cold start. When no live scored outcomes exist yet, Forge labels the rate as backtest_prior and still computes EV from that prior. Live scored outcomes replace priors as n grows.",
        howToRead: "Baselines prevent fantasy 90% confidence on day one. A backtest_prior bucket is honestly labeled — verify against your live reliability curve over time.",
        howToUse: "Seed baselines via `npm run backtest -- --upload` from walk-forward results. Until uploaded, EV stays WAIT with no calibrated hit rate.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Table: public.setup_baselines — readable by authenticated users. Bucket label: backtest_prior.</div>
</div>`
      }
    ]
  },
  {
    category: "Journaling",
    items: [
      {
        id: "adherence",
        tag: "Journal",
        title: "Plan Adherence",
        subtitle: "Did You Trade the Plan?",
        whatIsIt: "Adherence tracks whether your journal entry matches the Forge plan you acted on — direction, entry zone, stop, targets. Deviations are tagged for later review.",
        howToRead: "High adherence with poor results suggests the plan engine needs work. Low adherence with poor results suggests discipline is the bottleneck.",
        howToUse: "Log overrides too — they explain guardrail breaches that calibration cannot see otherwise.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">trade_journal table stores plan snapshot fields for comparison.</div>
</div>`
      },
      {
        id: "mae-mfe",
        tag: "Journal",
        title: "MAE & MFE",
        subtitle: "Excursion Analysis",
        whatIsIt: "Maximum Adverse Excursion (MAE) is the worst drawdown during the trade; MFE is the best favourable move. Scored automatically when predictions resolve.",
        howToRead: "Large MAE with small M stops means stops are tight or entries are late. Large MFE with small realised R means you are leaving money on the table in management.",
        howToUse: "Review MAE/MFE distributions per setup — they inform whether stops belong inside or outside typical noise.",
        visualHtml: `<div class="formula-box">MAE = max adverse move; MFE = max favourable move</div>`
      },
      {
        id: "behavioral-tags",
        tag: "Journal",
        title: "Behavioral Tags",
        subtitle: "FOMO, Revenge, Tilt",
        whatIsIt: "Tags classify execution mistakes separate from setup quality: FOMO chase, revenge trade after loss, moving stop, early exit, ignored guardrail, etc.",
        howToRead: "Behavioral tags do not change calibration math but explain residual P&amp;L after edge is accounted for. Patterns here are often the real alpha leak.",
        howToUse: "Be honest — private journals only help if they are truthful. One revenge tag per week is a risk limit signal.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Use tags consistently to filter journal reviews.</div>
</div>`
      },
      {
        id: "finding-edge",
        tag: "Journal",
        title: "Finding Edge",
        subtitle: "From Logs to Rules",
        whatIsIt: "Edge emerges when a setup×regime bucket shows positive avg R, acceptable MAE, and improving Brier over time. Journal + calibration loop surfaces which buckets qualify.",
        howToRead: "Cut buckets with negative EV after sufficient n. Promote buckets with positive EV and manageable drawdown. Retest after market regime shifts.",
        howToUse: "Forge is honest: if nothing in your journal beats break-even, the correct output is smaller size or no trade — not more indicators.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Accuracy panel + journal filters → which setups to keep.</div>
</div>`
      }
    ]
  },
  {
    category: "AI Analysis",
    items: [
      {
        id: "ai-overview",
        tag: "Intelligence",
        title: "AI Overview",
        subtitle: "How the report is actually produced",
        whatIsIt: "Forge sends a large structured snapshot of the market — indicators, market structure, order flow, futures positioning, pivots and multi-timeframe reads — to a language model via OpenRouter, and asks it to return one strict JSON object. The model is a narrator and a synthesiser, not the source of the numbers. The exact model is configurable (OPENROUTER_MODEL) and is shown on the AI Analysis panel next to the title.",
        howToRead: "Every AI report carries a provenance badge. Live AI means most fields came from the model. Partial AI means the model returned some usable fields and the rest fell back to deterministic values. Baseline means the model was unavailable or ignored, and you are reading the rules-based engine alone. A Baseline report is still valid analysis — it just has no language model in it.",
        howToUse: "Treat it as a second pair of eyes over data you can verify on the chart, not as an oracle. Where the AI's read and the chart disagree, trust the chart. The single most useful habit is to check whether the trade plan's invalidation level is somewhere you would actually place a stop.",
        visualHtml: `<div class="formula-box">Market snapshot &rarr; model (single pass, strict JSON schema) &rarr; field-by-field validation against the deterministic engine &rarr; trade-plan geometry check &rarr; regime gating &rarr; calibration clamp</div>
          <div class="edu-tips">
<div class="edu-tip info">The model never gets the last word on a price level. If its trade plan fails the geometry check (stop on the wrong side of entry, targets out of order, entry far from current price), the plan is discarded and replaced with the deterministic one.</div>
<div class="edu-tip info">There is one model call per analysis. The progress steps shown while it loads are a display animation, not separate reasoning passes.</div>
</div>`
      },
      {
        id: "ai-confidence",
        tag: "Score",
        title: "Signal Agreement vs Calibrated Confidence",
        subtitle: "Two different numbers — only one is a probability",
        whatIsIt: "Forge shows two scores and they mean very different things. Signal agreement counts how many independent checks (EMA stack, RSI side, MACD, pivot session bias, presence of S/R zones, divergence, pivot inflection) point the same way. Calibrated hit rate is the measured percentage of past predictions of this setup type, in this regime, that actually reached target before stop.",
        howToRead: "Signal agreement is shown out of 100 and is an alignment count, not a probability — 80/100 does not mean an 80% chance. The calibrated hit rate IS a probability, but only once the sample size (shown as n=) is meaningful. Below about 20 decided samples it is greyed out, because a hit rate built on five trades tells you nothing.",
        howToUse: "Use signal agreement to decide whether the picture is coherent enough to act on at all. Use the calibrated hit rate to decide whether the setup is worth its risk: a plan needing 40% to break even, on a setup that historically hits 35%, is a losing bet no matter how aligned the signals look.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info"><strong>Signal agreement 80/100</strong> — the indicators tell a consistent story. Says nothing about whether that story pays.</div>
<div class="edu-tip bull"><strong>Calibrated 58% (n=64)</strong> — measured from 64 scored outcomes. This one you can put in an expected-value calculation.</div>
<div class="edu-tip neutral"><strong>Calibrated 71% (n=7)</strong> — greyed out. Seven samples is noise, not an edge.</div>
</div>
          <div class="formula-box">If the model claims confidence far above the measured hit rate, Forge caps it. See "Calibration".</div>`
      },
      {
        id: "ai-phase",
        tag: "Market State",
        title: "Market Phase",
        subtitle: "Wyckoff-style Phases",
        whatIsIt: "The AI attempts to categorize the current market into distinct phases: Accumulation, Markup, Distribution, or Markdown.",
        howToRead: "Accumulation = bottom forming. Markup = bullish trend. Distribution = top forming. Markdown = bearish trend.",
        howToUse: "Align your trading style with the phase. Buy pullbacks in Markup; sell bounces in Markdown. Trade ranges in Accumulation/Distribution.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip info">Accumulation (Sideways, preparing to go up)</div>
<div class="edu-tip info">Markup (Strong uptrend)</div>
</div>`
      },
      {
        id: "ai-regime",
        tag: "Market State",
        title: "Market Regime",
        subtitle: "Trending, ranging, or volatile chop",
        whatIsIt: "A three-state classification of how price is behaving, computed from ADX (trend strength, and whether it is rising), the ATR percentile against its own recent history, and the Bollinger bandwidth percentile. It is not derived from moving-average alignment — it is a separate, volatility-aware read.",
        howToRead: "Trending means ADX is at or above 25 and rising, and the higher timeframes agree. Ranging means weak ADX with compressed bands, or a trend the higher timeframes contradict. Volatile chop means ATR sits in the top fifth of its recent range while ADX stays weak — big moves going nowhere, the most expensive condition to trade.",
        howToUse: "The regime decides which setups Forge will even propose. In volatile chop it refuses to give a directional plan and returns wait. In ranging it only allows fading within half an ATR of a real support or resistance zone. Regime is also why the same setup can carry different confidence on different days: hit rates are tracked per setup per regime.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull"><strong>Trending</strong> — trade continuation; stand aside on counter-trend fades.</div>
<div class="edu-tip neutral"><strong>Ranging</strong> — fade the edges only, and only near a real zone.</div>
<div class="edu-tip bear"><strong>Volatile chop</strong> — Forge returns wait. Wide stops, false breaks, worst risk-adjusted returns.</div>
</div>`
      }
    ]
  },
  {
    category: "Pivot Points",
    items: [
      {
        id: "pivot-intro",
        tag: "Concept",
        title: "What are Pivots?",
        subtitle: "Mathematical Support & Resistance",
        whatIsIt: "Pivot points are significant price levels calculated from the previous period's high, low, and close prices. They act as potential support and resistance.",
        howToRead: "The main Pivot Point (PP) is the central level. R1, R2, R3 are resistance levels above it. S1, S2, S3 are support levels below it.",
        howToUse: "Traders use these levels to set targets, place stop-losses, and identify potential reversal or breakout areas.",
        visualHtml: `<div class="formula-box">PP = (High + Low + Close) / 3</div>
          <div class="edu-tips">
<div class="edu-tip info">Pivots are objective levels calculated mathematically, unlike manually drawn trendlines.</div>
</div>`
      },
      {
        id: "pivot-levels",
        tag: "Levels",
        title: "PP, R & S Levels",
        subtitle: "The Anatomy of Pivots",
        whatIsIt: "The classic set of pivot points provides 7 key levels for the current session.",
        howToRead: "Price trading above PP is generally bullish, aiming for R1. Price trading below PP is generally bearish, aiming for S1.",
        howToUse: "If price breaks above R1, R2 becomes the next target. If it drops below S1, S2 is the next support.",
        visualHtml: `<div class="pivot-diagram"><div class="pivot-row r3"><span>R3 (Resistance 3)</span></div><div class="pivot-row r2"><span>R2 (Resistance 2)</span></div><div class="pivot-row r1"><span>R1 (Resistance 1)</span></div><div class="pivot-row pp"><span>PP (Pivot Point)</span></div><div class="pivot-row s1"><span>S1 (Support 1)</span></div><div class="pivot-row s2"><span>S2 (Support 2)</span></div><div class="pivot-row s3"><span>S3 (Support 3)</span></div></div>`
      },
      {
        id: "binance-pivots",
        tag: "Indicator",
        title: "Standard Pivots",
        subtitle: "Traditional auto-timeframe overlay",
        whatIsIt: "Standard pivot points use the Traditional Pivot Points model with an auto-selected higher timeframe and extended support/resistance levels up to R5 and S5.",
        howToRead: "The chart shows a central pivot (P) and a staircase of resistance above and support below. On lower chart timeframes, the indicator typically uses the previous day, week, or month depending on the timeframe.",
        howToUse: "Use the pivot band as a map of likely reaction levels. Price above P is bullish bias, while price below P is bearish bias. R1/R2 and S1/S2 often act as the first reaction and continuation zones.",
        visualHtml: `<div class="pivot-diagram"><div class="pivot-row r3"><span>R5</span></div><div class="pivot-row r2"><span>R4</span></div><div class="pivot-row r1"><span>R3</span></div><div class="pivot-row pp"><span>P</span></div><div class="pivot-row s1"><span>S1</span></div><div class="pivot-row s2"><span>S2</span></div><div class="pivot-row s3"><span>S5</span></div></div>
          <div class="edu-tips">
<div class="edu-tip info">Traditional pivots extend further than the classic 7-level set.</div>
</div>`
      },
      {
        id: "pivot-zone",
        tag: "Analysis",
        title: "Price Zone",
        subtitle: "Where are we now?",
        whatIsIt: "The Price Zone pinpoints exactly where the current price is located relative to the pivot levels.",
        howToRead: "It will display values like 'between_PP_R1' or 'below_S2'.",
        howToUse: "This instantly tells you the immediate micro-trend. If you are 'between_PP_R1', the bias is slightly bullish, with R1 acting as the immediate ceiling.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">Between PP and R1: Bullish bias.</div>
<div class="edu-tip bear">Between S1 and PP: Bearish bias.</div>
</div>`
      },
      {
        id: "pivot-fib",
        tag: "Variant",
        title: "Fibonacci Pivots",
        subtitle: "Pivots merged with Fibonacci",
        whatIsIt: "Fibonacci Pivots use the same central Pivot Point (PP) but calculate the R and S levels by multiplying the previous period's range by Fibonacci ratios (0.382, 0.618, 1.000).",
        howToRead: "Read them like other pivot sets, but they often provide closer, more reactive levels.",
        howToUse: "Many professional traders prefer Fib pivots because financial markets frequently respect Fibonacci ratios. Use them as confluence with standard pivots or EMAs.",
        visualHtml: `<div class="formula-box">R1 = PP + (Range * 0.382)</div>`
      }
    ]
  },
  {
    category: "Trade Logic",
    items: [
      {
        id: "scenarios",
        tag: "Planning",
        title: "Trade Scenarios",
        subtitle: "Bullish & Bearish Cases",
        whatIsIt: "The AI outlines the most likely path for the price to move up (Bullish Scenario) and down (Bearish Scenario).",
        howToRead: "These are 'IF/THEN' statements. Example: 'IF price holds EMA 20, THEN target R1'.",
        howToUse: "As a trader, you should always have a plan for both directions. Wait for the market to trigger one of the scenarios.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">Bullish: Price forms a higher low and breaks resistance.</div>
<div class="edu-tip bear">Bearish: Price fails at resistance and breaks support.</div>
</div>`
      },
      {
        id: "invalidation",
        tag: "Risk Management",
        title: "Invalidation Levels",
        subtitle: "When the idea is wrong",
        whatIsIt: "The specific price level at which a trade scenario is proven incorrect. The bullish and bearish cases have different invalidation levels and Forge shows them separately: the bull case dies below support, the bear case dies above resistance.",
        howToRead: "Each scenario card carries its own 'Invalidates if' line. If the two ever show the same level, something is wrong — they are structurally different prices on opposite sides of the current market.",
        howToUse: "Place your stop just beyond the invalidation level for the direction you are actually trading, and size the position from that distance rather than from a round number you like. If the invalidation is so far away that a sensible position size becomes tiny, that is the trade telling you it is a bad entry — wait for price to come closer to the level.",
        visualHtml: `<div class="edu-tips">
<div class="edu-tip bull">Long idea &rarr; invalidated by a decisive close <strong>below support</strong>.</div>
<div class="edu-tip bear">Short idea &rarr; invalidated by a decisive close <strong>above resistance</strong>.</div>
</div>
          <div class="formula-box">Position size = (account &times; risk%) &divide; |entry &minus; invalidation|</div>`
      },
      {
        id: "signals",
        tag: "Action",
        title: "Reading Signals",
        subtitle: "Putting it together",
        whatIsIt: "Signals are the culmination of the analysis: actionable alerts suggesting a high-probability trade opportunity.",
        howToRead: "A signal will specify direction (Long/Short), a trigger zone, and an invalidation point.",
        howToUse: "Never follow signals blindly. Ensure the signal aligns with the higher timeframe trend and manage your risk (never risk more than 1-2% of your portfolio per trade).",
        visualHtml: `<div class="edu-tips"><div class="edu-tip bear" style="background: rgba(245, 158, 11, 0.15); color: var(--text-primary); border-left-color: var(--neutral);"><strong style="color:var(--neutral)">Risk Note:</strong> Trading cryptocurrencies involves significant risk. Always size your positions appropriately.</div></div>`
      }
    ]
  }
];

// ── Icon Library (unique per topic ID / category) ──
export const ICONS = {
  'last-price': `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
  'price-change': `<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
  'volume': `<svg viewBox="0 0 24 24"><rect x="18" y="3" width="4" height="18"></rect><rect x="10" y="8" width="4" height="13"></rect><rect x="2" y="13" width="4" height="8"></rect></svg>`,
  'relative-volume': `<svg viewBox="0 0 24 24"><rect x="4" y="10" width="3" height="10"></rect><rect x="10" y="6" width="3" height="14"></rect><rect x="16" y="2" width="3" height="18"></rect></svg>`,
  'session-structure': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  'cme-gap': `<svg viewBox="0 0 24 24"><path d="M4 19V5"></path><path d="M20 19V5"></path><path d="M4 12h16" stroke-dasharray="4 3"></path></svg>`,
  'ema': `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
  'adx-di': `<svg viewBox="0 0 24 24"><path d="M3 3v18h18"></path><path d="M7 14l4-4 3 3 5-6"></path></svg>`,
  'supertrend': `<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"></polyline></svg>`,
  'ichimoku': `<svg viewBox="0 0 24 24"><path d="M2 12h20"></path><path d="M12 2v20"></path><rect x="6" y="8" width="12" height="8" rx="1"></rect></svg>`,
  'donchian': `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"></rect><line x1="3" y1="12" x2="21" y2="12"></line></svg>`,
  'hurst': `<svg viewBox="0 0 24 24"><path d="M4 20V4"></path><path d="M4 20h16"></path><path d="M8 16c2-8 4-8 6 0s4 8 6 0"></path></svg>`,
  'rsi': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`,
  'stoch-rsi': `<svg viewBox="0 0 24 24"><path d="M3 3v18h18"></path><path d="M7 16l3-6 3 4 4-8"></path></svg>`,
  'macd': `<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`,
  'divergence': `<svg viewBox="0 0 24 24"><path d="M4 18l6-6 4 4 6-10"></path><path d="M4 6h16" stroke-dasharray="3 2"></path></svg>`,
  'atr': `<svg viewBox="0 0 24 24"><path d="M12 2v20"></path><path d="M8 6h8"></path><path d="M6 18h12"></path></svg>`,
  'bollinger': `<svg viewBox="0 0 24 24"><path d="M3 12c3-6 6-6 9 0s6 6 9 0"></path><path d="M3 12c3 6 6 6 9 0s6-6 9 0" opacity="0.5"></path></svg>`,
  'keltner': `<svg viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M4 8h16"></path><path d="M4 16h16"></path></svg>`,
  'ttm-squeeze': `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="8" rx="1"></rect><path d="M4 12h4M16 12h4"></path></svg>`,
  'realized-vol': `<svg viewBox="0 0 24 24"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 15l2-4 2 2 2-6 2 8"></path></svg>`,
  'volatility-regime': `<svg viewBox="0 0 24 24"><path d="M3 20h18"></path><path d="M6 16l3-8 3 5 3-10 3 13"></path></svg>`,
  'obv': `<svg viewBox="0 0 24 24"><polyline points="4 16 8 10 12 14 16 8 20 12"></polyline></svg>`,
  'cvd': `<svg viewBox="0 0 24 24"><path d="M4 18h16"></path><path d="M6 14l4-6 4 3 4-7"></path></svg>`,
  'spot-perp-divergence': `<svg viewBox="0 0 24 24"><path d="M4 6h7v12H4z"></path><path d="M13 10h7v8h-7z"></path></svg>`,
  'order-book-imbalance': `<svg viewBox="0 0 24 24"><rect x="3" y="8" width="8" height="8"></rect><rect x="13" y="8" width="8" height="8"></rect></svg>`,
  'book-slope': `<svg viewBox="0 0 24 24"><path d="M4 20l8-16 8 16"></path></svg>`,
  'resting-walls': `<svg viewBox="0 0 24 24"><line x1="4" y1="8" x2="20" y2="8"></line><line x1="4" y1="16" x2="20" y2="16"></line></svg>`,
  'swings': `<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"></polyline></svg>`,
  'bos-choch': `<svg viewBox="0 0 24 24"><path d="M4 12h10"></path><polyline points="14 8 18 12 14 16"></polyline></svg>`,
  'sr-zones': `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>`,
  'eqh-eql': `<svg viewBox="0 0 24 24"><line x1="4" y1="8" x2="20" y2="8"></line><line x1="4" y1="16" x2="20" y2="16"></line></svg>`,
  'liquidity-sweeps': `<svg viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M12 4v16"></path><circle cx="12" cy="12" r="2"></circle></svg>`,
  'fvgs': `<svg viewBox="0 0 24 24"><rect x="6" y="9" width="12" height="6" fill="none"></rect><path d="M6 9l6-4 6 4M6 15l6 4 6-4"></path></svg>`,
  'order-blocks': `<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"></rect><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  'poc': `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"></line><ellipse cx="12" cy="12" rx="6" ry="3"></ellipse></svg>`,
  'vah-val': `<svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="17" x2="20" y2="17"></line><line x1="12" y1="7" x2="12" y2="17"></line></svg>`,
  'hvn-lvn': `<svg viewBox="0 0 24 24"><rect x="4" y="10" width="4" height="8"></rect><rect x="10" y="6" width="4" height="4"></rect><rect x="16" y="12" width="4" height="6"></rect></svg>`,
  'naked-poc': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v4M12 18v4"></path></svg>`,
  'developing-value-area': `<svg viewBox="0 0 24 24"><path d="M4 20V4"></path><path d="M4 20h16"></path><path d="M8 16V8h3v8H8zM13 14V10h3v4h-3z"></path></svg>`,
  'session-vwap': `<svg viewBox="0 0 24 24"><path d="M4 18l8-12 4 6 4-4 4 10"></path></svg>`,
  'anchored-vwap': `<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"></circle><path d="M8 18c4-10 8-10 12 0"></path></svg>`,
  'vwap-bands': `<svg viewBox="0 0 24 24"><path d="M3 12h18"></path><path d="M3 8h18"></path><path d="M3 16h18"></path></svg>`,
  'anchor-selection': `<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7z"></path></svg>`,
  'funding-zscore': `<svg viewBox="0 0 24 24"><path d="M12 2v20"></path><path d="M8 6h8M8 18h8"></path></svg>`,
  'open-interest': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M8 12h8"></path></svg>`,
  'long-short-ratio': `<svg viewBox="0 0 24 24"><path d="M7 4v16M17 4v16"></path><path d="M7 12h10"></path></svg>`,
  'basis': `<svg viewBox="0 0 24 24"><path d="M4 7h8v10H4z"></path><path d="M14 9h6v6h-6z"></path></svg>`,
  'liquidation-clusters': `<svg viewBox="0 0 24 24"><path d="M12 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"></path></svg>`,
  'btc-beta': `<svg viewBox="0 0 24 24"><path d="M4 18l6-10 4 6 6-12"></path></svg>`,
  'correlation': `<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="6" r="2"></circle><path d="M8 16l8-8"></path></svg>`,
  'dominance': `<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20"></path><path d="M12 2a10 10 0 0 1 0 20" opacity="0.4"></path></svg>`,
  'alt-btc-breakdown': `<svg viewBox="0 0 24 24"><path d="M3 12h8"></path><path d="M13 8l6 4-6 4"></path></svg>`,
  'risk-reward': `<svg viewBox="0 0 24 24"><path d="M4 20V4"></path><path d="M4 20h16"></path><path d="M8 16l4-8 4 5 4-9"></path></svg>`,
  'position-sizing': `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 12h8"></path></svg>`,
  'expected-value': `<svg viewBox="0 0 24 24"><path d="M5 19V5"></path><path d="M5 19h14"></path><path d="M9 15l3-6 3 3 3-6"></path></svg>`,
  'breakeven-hit-rate': `<svg viewBox="0 0 24 24"><path d="M4 12h16"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  'guardrails': `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  'trade-management': `<svg viewBox="0 0 24 24"><path d="M4 6h16"></path><path d="M4 12h10"></path><path d="M4 18h14"></path></svg>`,
  'brier-score': `<svg viewBox="0 0 24 24"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 15c2-6 4-6 6 0s4 6 6 0"></path></svg>`,
  'reliability-curve': `<svg viewBox="0 0 24 24"><path d="M4 20l6-8 4 4 6-10"></path><path d="M4 20h16"></path></svg>`,
  'empirical-vs-model': `<svg viewBox="0 0 24 24"><path d="M8 6h8v12H8z"></path><path d="M16 10h4v8h-4z"></path></svg>`,
  'why-n-matters': `<svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M4 12h10"></path><path d="M4 17h6"></path></svg>`,
  'base-rates': `<svg viewBox="0 0 24 24"><path d="M3 3v18h18"></path><rect x="7" y="12" width="3" height="6"></rect><rect x="12" y="8" width="3" height="10"></rect><rect x="17" y="5" width="3" height="13"></rect></svg>`,
  'adherence': `<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
  'mae-mfe': `<svg viewBox="0 0 24 24"><path d="M12 2v20"></path><path d="M8 8h8"></path><path d="M6 16h12"></path></svg>`,
  'behavioral-tags': `<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
  'finding-edge': `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  'pivots-intro': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  'pivot-levels': `<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,
  'price-zone': `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>`,
  'binance-pivots': `<svg viewBox="0 0 24 24"><line x1="4" y1="4" x2="20" y2="4"></line><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="4" y1="20" x2="20" y2="20"></line></svg>`,
  'fibonacci': `<svg viewBox="0 0 24 24"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10"></path><path d="M12 22c2.5-3 4-6.5 4-10S14.5 5 12 2"></path><path d="M12 12h10"></path></svg>`,
  'ai-overview': `<svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`,
  'confidence': `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  'market-phase': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><line x1="2" y1="12" x2="22" y2="12"></line></svg>`,
  'market-regime': `<svg viewBox="0 0 24 24"><path d="M3 3v18h18M9 9l3 3 4-4 5 5"></path></svg>`,
  'trade-logic': `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
  'swing-points': `<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"></polyline><polyline points="14 7 21 7 21 14"></polyline></svg>`,
  'anomalies': `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  'PRICE & MARKET': `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
  'TREND': `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
  'MOMENTUM': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`,
  'VOLATILITY': `<svg viewBox="0 0 24 24"><path d="M3 20h18"></path><path d="M6 16l3-8 3 5 3-10 3 13"></path></svg>`,
  'VOLUME & ORDER FLOW': `<svg viewBox="0 0 24 24"><rect x="18" y="3" width="4" height="18"></rect><rect x="10" y="8" width="4" height="13"></rect><rect x="2" y="13" width="4" height="8"></rect></svg>`,
  'MARKET STRUCTURE': `<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"></polyline></svg>`,
  'VOLUME PROFILE': `<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"></line><ellipse cx="12" cy="12" rx="6" ry="3"></ellipse></svg>`,
  'VWAP': `<svg viewBox="0 0 24 24"><path d="M4 18l8-12 4 6 4-4 4 10"></path></svg>`,
  'DERIVATIVES': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M8 12h8"></path></svg>`,
  'CROSS-MARKET': `<svg viewBox="0 0 24 24"><path d="M3 3v18h18M9 9l3 3 4-4 5 5"></path></svg>`,
  'RISK & DECISION': `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  'CALIBRATION': `<svg viewBox="0 0 24 24"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 15c2-6 4-6 6 0s4 6 6 0"></path></svg>`,
  'JOURNALING': `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
  'PIVOT POINTS': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  'AI ANALYSIS': `<svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`,
  'TRADE LOGIC': `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
};

export function resolveIconId(id) {
  if (ICONS[id]) return id;
  if (id.includes('binance')) return 'binance-pivots';
  if (id.includes('relative') && id.includes('vol')) return 'relative-volume';
  if (id.includes('session')) return 'session-structure';
  if (id.includes('cme')) return 'cme-gap';
  if (id.includes('price')) return 'last-price';
  if (id.includes('volume') && !id.includes('profile')) return 'volume';
  if (id.includes('ema') || id === 'adx-di' || id.includes('supertrend') || id.includes('ichimoku') || id.includes('donchian') || id.includes('hurst')) return id.includes('hurst') ? 'hurst' : id.includes('donchian') ? 'donchian' : id.includes('ichimoku') ? 'ichimoku' : id.includes('supertrend') ? 'supertrend' : id.includes('adx') ? 'adx-di' : 'ema';
  if (id.includes('stoch')) return 'stoch-rsi';
  if (id.includes('rsi')) return 'rsi';
  if (id.includes('macd')) return 'macd';
  if (id.includes('diverg')) return 'divergence';
  if (id.includes('atr') || id.includes('bollinger') || id.includes('keltner') || id.includes('squeeze') || id.includes('realized') || id.includes('volatility')) {
    if (id.includes('squeeze')) return 'ttm-squeeze';
    if (id.includes('keltner')) return 'keltner';
    if (id.includes('bollinger')) return 'bollinger';
    if (id.includes('realized')) return 'realized-vol';
    if (id.includes('regime')) return 'volatility-regime';
    return 'atr';
  }
  if (id.includes('obv')) return 'obv';
  if (id.includes('cvd')) return 'cvd';
  if (id.includes('perp') || id.includes('spot-perp')) return 'spot-perp-divergence';
  if (id.includes('imbalance') || id.includes('order-book')) return 'order-book-imbalance';
  if (id.includes('slope') || id.includes('book-slope')) return 'book-slope';
  if (id.includes('wall')) return 'resting-walls';
  if (id.includes('swing')) return 'swings';
  if (id.includes('bos') || id.includes('choch')) return 'bos-choch';
  if (id.includes('sr-zone') || id.includes('zone') && id.includes('pivot')) return 'price-zone';
  if (id.includes('sr-zone')) return 'sr-zones';
  if (id.includes('eqh') || id.includes('eql')) return 'eqh-eql';
  if (id.includes('sweep')) return 'liquidity-sweeps';
  if (id.includes('fvg')) return 'fvgs';
  if (id.includes('order-block')) return 'order-blocks';
  if (id.includes('poc') && !id.includes('naked')) return 'poc';
  if (id.includes('naked')) return 'naked-poc';
  if (id.includes('vah') || id.includes('val')) return 'vah-val';
  if (id.includes('hvn') || id.includes('lvn')) return 'hvn-lvn';
  if (id.includes('developing')) return 'developing-value-area';
  if (id.includes('vwap')) {
    if (id.includes('anchor') && id.includes('selection')) return 'anchor-selection';
    if (id.includes('anchor')) return 'anchored-vwap';
    if (id.includes('band')) return 'vwap-bands';
    return 'session-vwap';
  }
  if (id.includes('funding')) return 'funding-zscore';
  if (id.includes('open-interest') || id.includes('oi')) return 'open-interest';
  if (id.includes('long-short') || id.includes('ratio')) return 'long-short-ratio';
  if (id.includes('basis')) return 'basis';
  if (id.includes('liquidation')) return 'liquidation-clusters';
  if (id.includes('beta')) return 'btc-beta';
  if (id.includes('correlation')) return 'correlation';
  if (id.includes('dominance')) return 'dominance';
  if (id.includes('breakdown') || id.includes('alt-btc')) return 'alt-btc-breakdown';
  if (id.includes('risk-reward') || id.includes('reward')) return 'risk-reward';
  if (id.includes('position') || id.includes('sizing')) return 'position-sizing';
  if (id.includes('expected') || id.includes('ev')) return 'expected-value';
  if (id.includes('breakeven')) return 'breakeven-hit-rate';
  if (id.includes('guardrail')) return 'guardrails';
  if (id.includes('management')) return 'trade-management';
  if (id.includes('brier')) return 'brier-score';
  if (id.includes('reliability')) return 'reliability-curve';
  if (id.includes('empirical')) return 'empirical-vs-model';
  if (id.includes('why-n') || id.includes('n-matters')) return 'why-n-matters';
  if (id.includes('base-rate')) return 'base-rates';
  if (id.includes('adherence')) return 'adherence';
  if (id.includes('mae') || id.includes('mfe')) return 'mae-mfe';
  if (id.includes('behavioral') || id.includes('tag')) return 'behavioral-tags';
  if (id.includes('finding-edge') || id.includes('journal')) return 'finding-edge';
  if (id.includes('pivot') || id.includes('pp')) return 'pivot-levels';
  if (id.includes('fib')) return 'fibonacci';
  if (id === 'ai-confidence' || id.includes('confidence')) return 'confidence';
  if (id.includes('ai')) return 'ai-overview';
  if (id.includes('phase')) return 'market-phase';
  if (id.includes('regime')) return 'market-regime';
  if (id.includes('anomal') || id.includes('alert')) return 'anomalies';
  if (id.includes('invalid') || id.includes('scenario') || id.includes('signal') || id.includes('logic') || id.includes('trade')) return 'trade-logic';
  if (id.includes('zone')) return 'price-zone';
  return 'default';
}
