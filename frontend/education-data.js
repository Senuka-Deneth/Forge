const educationData = [
  {
    category: "Price & Market",
    items: [
      {
        id: "last-price",
        tag: "Market Data",
        title: "Last Price",
        subtitle: "Current Trading Price",
        whatIsIt: "The Last Price is the price at which the most recent trade occurred on the Binance exchange for the selected symbol.",
        howToRead: "It is displayed as a numeric value. It updates in real-time if the WebSocket connection is active.",
        howToUse: "This is your baseline reference. All indicators, AI analysis, and pivot point calculations are based on this current price.",
        visualHtml: `
          <div class="formula-box">Example: $64,250.50</div>
          <div class="edu-tips">
            <div class="edu-tip info">Displayed at the top of the dashboard for quick reference.</div>
          </div>
        `
      },
      {
        id: "price-change",
        tag: "Market Data",
        title: "Price Change",
        subtitle: "Percentage Change",
        whatIsIt: "Price Change shows the percentage difference between the current Last Price and the closing price of the previous candle.",
        howToRead: "A positive percentage (green) means the price has gone up since the last period. A negative percentage (red) means the price has gone down.",
        howToUse: "Quickly gauge short-term sentiment. A large positive change indicates strong recent buying pressure, while a large negative change indicates selling pressure.",
        visualHtml: `
          <div class="formula-box">Formula: ((Current Price - Previous Close) / Previous Close) * 100</div>
          <div class="edu-tips">
            <div class="edu-tip bull">+2.45% (Price has increased)</div>
            <div class="edu-tip bear">-1.20% (Price has decreased)</div>
          </div>
        `
      },
      {
        id: "volume",
        tag: "Market Data",
        title: "Volume",
        subtitle: "Trading Volume",
        whatIsIt: "Volume is the total amount of the asset traded during the current candle period.",
        howToRead: "Higher volume means more trading activity. It's often visualized as a histogram at the bottom of the price chart.",
        howToUse: "Volume confirms price trends. An upward price movement with high volume is considered stronger and more reliable than one with low volume.",
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip bull">High Volume = Strong conviction in the current price move.</div>
            <div class="edu-tip neutral">Low Volume = Weak conviction, potential for a reversal or false breakout.</div>
          </div>
        `
      }
    ]
  },
  {
    category: "Indicators",
    items: [
      {
        id: "ema",
        tag: "Indicator",
        title: "EMA 20 & 50",
        subtitle: "Exponential Moving Averages",
        whatIsIt: "An EMA is a moving average that places a greater weight and significance on the most recent data points. The dashboard uses 20-period (short-term) and 50-period (medium-term) EMAs.",
        howToRead: "When the price is above an EMA, it indicates an uptrend. If EMA 20 is above EMA 50, the short-term trend is bullish.",
        howToUse: "Look for crossovers: EMA 20 crossing above EMA 50 is a bullish signal. EMAs can also act as dynamic support (in uptrends) or resistance (in downtrends).",
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip bull">Price > EMA 20 > EMA 50 — Strong Bullish Trend</div>
            <div class="edu-tip bear">Price < EMA 20 < EMA 50 — Strong Bearish Trend</div>
          </div>
        `
      },
      {
        id: "rsi",
        tag: "Indicator",
        title: "RSI 14",
        subtitle: "Relative Strength Index",
        whatIsIt: "The RSI measures the speed and magnitude of recent price changes to evaluate whether an asset is overbought or oversold. It oscillates between 0 and 100.",
        howToRead: "RSI above 70 is considered overbought. RSI below 30 is considered oversold.",
        howToUse: "Use RSI to spot potential reversals. If the price makes a new high but RSI makes a lower high, it's a bearish divergence (weakening trend).",
        visualHtml: `
          <div class="scale-bar">
            <div class="zone oversold" style="width:30%">0 – 30<br>Oversold</div>
            <div class="zone neutral-zone" style="width:40%">30 – 70<br>Neutral</div>
            <div class="zone overbought" style="width:30%">70 – 100<br>Overbought</div>
          </div>
          <div class="edu-tips">
            <div class="edu-tip bull">RSI < 30 — Asset may be oversold. Potential reversal up.</div>
            <div class="edu-tip bear">RSI > 70 — Asset may be overbought. Potential reversal down.</div>
          </div>
        `
      },
      {
        id: "macd",
        tag: "Indicator",
        title: "MACD",
        subtitle: "Moving Average Convergence Divergence",
        whatIsIt: "MACD is a trend-following momentum indicator that shows the relationship between two moving averages (usually 12 and 26-period EMAs).",
        howToRead: "It consists of the MACD Line, a Signal Line (9-day EMA of MACD), and a Histogram representing the difference between the two lines.",
        howToUse: "A bullish signal occurs when the MACD line crosses above the signal line. A bearish signal occurs when it crosses below. The histogram shows the strength of the momentum.",
        visualHtml: `
          <div class="macd-visual" style="align-items: center; justify-content: center;">
             <div style="width: 100px; height: 2px; background: #60a5fa; position: relative;">
                <div style="position: absolute; top: -10px; left: 10px; width: 80px; height: 2px; background: #f59e0b; transform: rotate(15deg);"></div>
             </div>
          </div>
          <div class="edu-tips" style="margin-top: 10px;">
            <div class="edu-tip bull">MACD Line > Signal Line — Bullish Momentum</div>
            <div class="edu-tip bear">MACD Line < Signal Line — Bearish Momentum</div>
          </div>
        `
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
        visualHtml: `
          <div class="formula-box">PP = (High + Low + Close) / 3</div>
           <div class="edu-tips">
            <div class="edu-tip info">Pivots are objective levels calculated mathematically, unlike manually drawn trendlines.</div>
          </div>
        `
      },
      {
        id: "pivot-levels",
        tag: "Levels",
        title: "PP, R & S Levels",
        subtitle: "The Anatomy of Pivots",
        whatIsIt: "The classic set of pivot points provides 7 key levels for the current session.",
        howToRead: "Price trading above PP is generally bullish, aiming for R1. Price trading below PP is generally bearish, aiming for S1.",
        howToUse: "If price breaks above R1, R2 becomes the next target. If it drops below S1, S2 is the next support.",
        visualHtml: `
          <div class="pivot-diagram">
            <div class="pivot-row r3"><span>R3 (Resistance 3)</span></div>
            <div class="pivot-row r2"><span>R2 (Resistance 2)</span></div>
            <div class="pivot-row r1"><span>R1 (Resistance 1)</span></div>
            <div class="pivot-row pp"><span>PP (Pivot Point)</span></div>
            <div class="pivot-row s1"><span>S1 (Support 1)</span></div>
            <div class="pivot-row s2"><span>S2 (Support 2)</span></div>
            <div class="pivot-row s3"><span>S3 (Support 3)</span></div>
          </div>
        `
      },
      {
        id: "pivot-zone",
        tag: "Analysis",
        title: "Price Zone",
        subtitle: "Where are we now?",
        whatIsIt: "The Price Zone pinpoints exactly where the current price is located relative to the pivot levels.",
        howToRead: "It will display values like 'between_PP_R1' or 'below_S2'.",
        howToUse: "This instantly tells you the immediate micro-trend. If you are 'between_PP_R1', the bias is slightly bullish, with R1 acting as the immediate ceiling.",
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip bull">Between PP and R1: Bullish bias.</div>
            <div class="edu-tip bear">Between S1 and PP: Bearish bias.</div>
          </div>
        `
      },
      {
        id: "pivot-fib",
        tag: "Variant",
        title: "Fibonacci Pivots",
        subtitle: "Pivots merged with Fibonacci",
        whatIsIt: "Fibonacci Pivots use the same central Pivot Point (PP) but calculate the R and S levels by multiplying the previous period's range by Fibonacci ratios (0.382, 0.618, 1.000).",
        howToRead: "Read them exactly like Classic Pivots, but they often provide closer, more reactive levels.",
        howToUse: "Many professional traders prefer Fib pivots because financial markets frequently respect Fibonacci ratios. Use them as confluence with classic pivots or EMAs.",
        visualHtml: `
          <div class="formula-box">R1 = PP + (Range * 0.382)</div>
        `
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
        subtitle: "Nemotron 120B Reasoning",
        whatIsIt: "The dashboard integrates with a state-of-the-art Large Language Model (Nemotron 120B) to interpret purely numerical chart data and translate it into human-readable analysis.",
        howToRead: "The AI provides a synthesized view of Trend, Momentum, Invalidations, and overall Bias.",
        howToUse: "Use the AI report as a 'second pair of eyes'. It combines multiple indicators (RSI, MACD, EMAs) and price action to give a holistic view.",
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip info">The AI uses a "2-turn strategy": it first analyzes the data internally, then verifies its own findings before outputting the final JSON report.</div>
          </div>
        `
      },
      {
        id: "ai-confidence",
        tag: "Score",
        title: "Confidence Score",
        subtitle: "AI Conviction",
        whatIsIt: "A percentage score (0-100%) indicating how strongly aligned the technical signals are.",
        howToRead: "A high score (>70%) means multiple indicators (trend, momentum, price action) agree. A low score (<40%) means indicators are conflicting.",
        howToUse: "Lower your trade size or stand aside when confidence is low. Aggressively pursue setups when confidence is high and aligns with your own analysis.",
        visualHtml: `
           <div class="conf-visual" style="height: 12px; border-radius: 6px; overflow: hidden; background: var(--bg-input);">
             <div style="width: 75%; background: var(--bull); height: 100%;"></div>
           </div>
           <div style="font-size: 11px; text-align: right; color: var(--text-primary); margin-top: 4px; font-weight: bold;">75% Confidence</div>
        `
      },
      {
        id: "ai-phase",
        tag: "Market State",
        title: "Market Phase",
        subtitle: "Wyckoff-style Phases",
        whatIsIt: "The AI attempts to categorize the current market into distinct phases: Accumulation, Markup, Distribution, or Markdown.",
        howToRead: "Accumulation = bottom forming. Markup = bullish trend. Distribution = top forming. Markdown = bearish trend.",
        howToUse: "Align your trading style with the phase. Buy pullbacks in Markup; sell bounces in Markdown. Trade ranges in Accumulation/Distribution.",
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip neutral">Accumulation (Sideways, preparing to go up)</div>
            <div class="edu-tip bull">Markup (Strong uptrend)</div>
          </div>
        `
      },
      {
        id: "ai-regime",
        tag: "Market State",
        title: "Market Regime",
        subtitle: "Trending vs Ranging",
        whatIsIt: "Identifies the behavior of the price action: Trending, Ranging, Breakout, or Reversal.",
        howToRead: "It relies on moving average alignment and swing point structure.",
        howToUse: "Don't use trend-following strategies (like EMA crossovers) in a 'Ranging' regime. Don't fade moves (bet against them) in a 'Trending' regime.",
        visualHtml: `
           <div class="edu-tips">
            <div class="edu-tip info">Trending: Follow the trend.</div>
            <div class="edu-tip neutral">Ranging: Buy support, sell resistance.</div>
          </div>
        `
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
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip bull">Bullish: Price forms a higher low and breaks resistance.</div>
            <div class="edu-tip bear">Bearish: Price fails at resistance and breaks support.</div>
          </div>
        `
      },
      {
        id: "invalidation",
        tag: "Risk Management",
        title: "Invalidation Levels",
        subtitle: "When the idea is wrong",
        whatIsIt: "The specific price level at which a trade scenario is proven incorrect.",
        howToRead: "If your bullish target is $65,000, but the invalidation is $60,000, your thesis is broken if price drops below $60k.",
        howToUse: "Set your Stop-Loss orders slightly beyond the invalidation level to protect your capital.",
        visualHtml: `
          <div class="formula-box">Always place your stop-loss at the invalidation point.</div>
        `
      },
      {
        id: "signals",
        tag: "Action",
        title: "Reading Signals",
        subtitle: "Putting it together",
        whatIsIt: "Signals are the culmination of the analysis: actionable alerts suggesting a high-probability trade opportunity.",
        howToRead: "A signal will specify direction (Long/Short), a trigger zone, and an invalidation point.",
        howToUse: "Never follow signals blindly. Ensure the signal aligns with the higher timeframe trend and manage your risk (never risk more than 1-2% of your portfolio per trade).",
        visualHtml: `
          <div class="edu-tips">
            <div class="edu-tip bear" style="background: rgba(245, 158, 11, 0.15); color: var(--text-primary); border-left-color: var(--neutral);">
              <strong style="color:var(--neutral)">Risk Note:</strong> Trading cryptocurrencies involves significant risk. Always size your positions appropriately.
            </div>
          </div>
        `
      }
    ]
  }
];
