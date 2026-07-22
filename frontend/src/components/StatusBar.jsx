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
  aiAnalysis,
  signalAgreement = null,
  alertToast = '',
  armedAlerts = [],
}) {
  const positive = priceChange != null && priceChange >= 0

  const rsiValue = latestCandle?.rsi14 != null ? latestCandle.rsi14.toFixed(2) : '—'
  const changeText = priceChange == null ? '—' : `${positive ? '+' : ''}${priceChange.toFixed(2)}%`
  const changeColorClass = positive ? 'bull' : 'bear'

  const rsiState = aiAnalysis?.indicators?.rsi?.state ? aiAnalysis.indicators.rsi.state.replace(/_/g, ' ') : '—'
  const aiBias = aiAnalysis?.summary?.bias ? aiAnalysis.summary.bias.replace(/_/g, ' ') : '—'

  const hasAiConfidence = aiAnalysis?.summary?.confidence != null
  const agreementScore = signalAgreement?.score
  const signalValue = hasAiConfidence
    ? `${aiAnalysis.summary.confidence}%`
    : agreementScore != null
      ? `${agreementScore}/100`
      : '—'
  const signalSub = hasAiConfidence
    ? aiBias
    : agreementScore != null
      ? (signalAgreement?.label ?? '—')
      : '—'
  const signalSkeleton = !hasAiConfidence && agreementScore == null

  return (
    <>
      {alertToast && (
        <div
          className="ai-signal-note"
          style={{
            marginBottom: '8px',
            padding: '8px 12px',
            background: 'var(--bull-soft)',
            color: 'var(--bull)',
            borderRadius: '6px',
            fontWeight: 600,
          }}
          role="status"
        >
          {alertToast}
        </div>
      )}
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-label">Last Price</div>
          <div className={`kpi-value format-tabular${latestPrice == null ? ' skeleton' : ''}`} id="kpi-price">{formatPrice(latestPrice)}</div>
          <div className={`kpi-change ${priceChange != null ? changeColorClass + '-pill' : ''}`} id="kpi-change">{changeText}</div>
          <div className="kpi-sub">24h</div>
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
          <div className={`kpi-value format-tabular${signalSkeleton ? ' skeleton' : ''}`} id="kpi-confidence">{signalValue}</div>
          <div className="kpi-sub kpi-sub--caps" id="kpi-bias">{signalSub}</div>
        </div>
        {armedAlerts.length > 0 && (
          <div className="kpi-card">
            <div className="kpi-label">Armed alerts</div>
            <div className="kpi-value format-tabular">{armedAlerts.length}</div>
            <div className="kpi-sub">
              {armedAlerts.slice(0, 2).map((a) => `${a.symbol}@${a.level}`).join(' · ')}
              {armedAlerts.length > 2 ? '…' : ''}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
