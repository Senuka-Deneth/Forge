function formatPrice(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })
}

function formatVolume(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })
}

export default function StatusBar({
  latestPrice,
  priceChange,
  latestCandle,
  aiAnalysis
}) {
  const positive = priceChange != null && priceChange >= 0

  const rsiValue = latestCandle?.rsi14 != null ? latestCandle.rsi14.toFixed(2) : '—'
  const changeText = priceChange == null ? '—' : `${positive ? '+' : ''}${priceChange.toFixed(2)}%`
  const changeColorClass = positive ? 'bull' : 'bear'

  const rsiState = aiAnalysis?.indicators?.rsi?.state ? aiAnalysis.indicators.rsi.state.replace(/_/g, ' ') : '—'
  const aiConfidence = aiAnalysis?.summary?.confidence != null ? `${aiAnalysis.summary.confidence}%` : '—'
  const aiBias = aiAnalysis?.summary?.bias ? aiAnalysis.summary.bias.replace(/_/g, ' ') : '—'

  return (
    <div className="kpi-strip">
      <div className="kpi-card">
        <div className="kpi-label">Last Price</div>
        <div className={`kpi-value format-tabular${latestPrice == null ? ' skeleton' : ''}`} id="kpi-price">{formatPrice(latestPrice)}</div>
        <div className={`kpi-change ${priceChange != null ? changeColorClass + '-pill' : ''}`} id="kpi-change">{changeText}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">RSI 14</div>
        <div className={`kpi-value format-tabular${latestCandle?.rsi14 == null ? ' skeleton' : ''}`} id="kpi-rsi">{rsiValue}</div>
        <div className="kpi-sub kpi-sub--caps" id="kpi-rsi-state">{rsiState}</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label">Volume</div>
        <div className={`kpi-value format-tabular${latestCandle?.volume == null ? ' skeleton' : ''}`} id="kpi-volume">{formatVolume(latestCandle?.volume)}</div>
        <div className="kpi-sub">Latest candle</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-label" title="Indicator confluence score — not a probability">Signal agreement</div>
        <div className={`kpi-value format-tabular${aiAnalysis?.summary?.confidence == null ? ' skeleton' : ''}`} id="kpi-confidence">{aiConfidence}</div>
        <div className="kpi-sub kpi-sub--caps" id="kpi-bias">{aiBias}</div>
      </div>
    </div>
  )
}