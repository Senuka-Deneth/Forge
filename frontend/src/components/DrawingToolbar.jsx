import { DRAWING_PALETTE, DRAWING_TOOLS, positionMetrics } from '../utils/drawingTools'

const RAIL_TOOLS = [
  'pointer',
  'horizontal',
  'vertical',
  'trendline',
  'fib',
  'rect',
  'measure',
  'position',
  'avwap',
  'fib-extension',
  'channel',
  'text',
]

const TOOL_ICONS = {
  pointer: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l7 16 2.5-6.5L20 11z" />
    </svg>
  ),
  horizontal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 12h18" />
    </svg>
  ),
  vertical: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3v18" />
    </svg>
  ),
  trendline: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 18L20 6" />
      <path d="M20 6h-5M20 6v5" />
    </svg>
  ),
  fib: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 10h16M4 14h10M4 18h16" />
    </svg>
  ),
  rect: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  ),
  measure: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 18L18 4" />
      <path d="M8 18h-4v-4M16 4h4v4" />
    </svg>
  ),
  position: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 4v16M8 8h8M9 16h6" />
    </svg>
  ),
  avwap: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16c3-8 5-4 8-8s5 0 8 4" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  'fib-extension': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 18l6-8 4 3 6-9" />
      <path d="M4 8h8M4 12h12" />
    </svg>
  ),
  channel: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 16L20 6M4 20L20 10" />
    </svg>
  ),
  text: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 7h14M12 7v12" />
    </svg>
  ),
}

function DrawingStylePopover({
  drawing,
  popoverPos,
  onChange,
  onDelete,
  onClose,
  onArmAlert,
  alertStatus,
}) {
  if (!drawing) return null

  const metrics = drawing.type === 'position' ? positionMetrics(drawing) : null
  const style = popoverPos
    ? { left: Math.min(popoverPos.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 300), top: popoverPos.y }
    : undefined

  const patch = (partial) => onChange({ ...drawing, ...partial })
  const patchMeta = (partial) => onChange({ ...drawing, meta: { ...drawing.meta, ...partial } })

  return (
    <div className="drawing-popover" style={style} role="dialog" aria-label="Drawing style">
      <div className="pivot-popover-header">
        <div className="head">{DRAWING_TOOLS[drawing.type]?.label || drawing.type}</div>
        <button type="button" className="pivot-popover-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="stack-3">
        <div className="field-group">
          <label className="field-label" htmlFor="dw-color">Color</label>
          <div className="drawing-color-row">
            <input
              id="dw-color"
              type="color"
              className="color-swatch"
              value={drawing.color?.startsWith('#') ? drawing.color : '#4a9eff'}
              onChange={(e) => patch({ color: e.target.value })}
            />
            <div className="drawing-palette">
              {DRAWING_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`drawing-palette-swatch${drawing.color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                  onClick={() => patch({ color: c })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="dw-width">Line width</label>
          <input
            id="dw-width"
            type="number"
            className="field"
            min="1"
            max="4"
            value={drawing.lineWidth || 1}
            onChange={(e) => patch({ lineWidth: Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1)) })}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="dw-style">Line style</label>
          <select
            id="dw-style"
            className="field"
            value={drawing.lineStyle || 'solid'}
            onChange={(e) => patch({ lineStyle: e.target.value })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>

        {(drawing.type === 'horizontal' || drawing.type === 'trendline' || drawing.type === 'channel') && (
          <div className="field-group">
            <label className="row-between">
              <span className="field-label">Extend right</span>
              <input
                type="checkbox"
                className="checkbox"
                checked={Boolean(drawing.meta?.extendRight)}
                onChange={(e) => patchMeta({ extendRight: e.target.checked })}
              />
            </label>
            {(drawing.type === 'trendline' || drawing.type === 'channel') && (
              <label className="row-between" style={{ marginTop: 8 }}>
                <span className="field-label">Extend left</span>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={Boolean(drawing.meta?.extendLeft)}
                  onChange={(e) => patchMeta({ extendLeft: e.target.checked })}
                />
              </label>
            )}
            {drawing.type === 'horizontal' && (
              <div className="field-hint">On: ray from the bar it formed on. Off: full-width level.</div>
            )}
          </div>
        )}

        {(drawing.type === 'fib' || drawing.type === 'fib-extension') && (
          <label className="row-between">
            <span className="field-label">Show labels</span>
            <input
              type="checkbox"
              className="checkbox"
              checked={drawing.meta?.showLabels !== false}
              onChange={(e) => patchMeta({ showLabels: e.target.checked })}
            />
          </label>
        )}

        {drawing.type === 'avwap' && (
          <label className="row-between">
            <span className="field-label">σ bands</span>
            <input
              type="checkbox"
              className="checkbox"
              checked={drawing.meta?.showBands !== false}
              onChange={(e) => patchMeta({ showBands: e.target.checked })}
            />
          </label>
        )}

        {drawing.type === 'position' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="dw-side">Side</label>
              <select
                id="dw-side"
                className="field"
                value={drawing.meta?.side || 'long'}
                onChange={(e) => patchMeta({ side: e.target.value })}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="dw-account">Account size</label>
              <input
                id="dw-account"
                type="number"
                className="field"
                min="0"
                step="100"
                placeholder="e.g. 10000"
                value={drawing.meta?.accountSize ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  patchMeta({ accountSize: Number.isFinite(v) && v > 0 ? v : undefined })
                }}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="dw-risk">Risk %</label>
              <input
                id="dw-risk"
                type="number"
                className="field"
                min="0"
                max="100"
                step="0.1"
                placeholder="e.g. 1"
                value={drawing.meta?.riskPct ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  patchMeta({ riskPct: Number.isFinite(v) && v > 0 ? v : undefined })
                }}
              />
            </div>
            {metrics && (
              <div className="field-hint">
                R:R {metrics.rr.toFixed(2)} · risk {metrics.riskPct.toFixed(2)}% · reward {metrics.rewardPct.toFixed(2)}%
                {metrics.positionSize != null ? ` · size ${metrics.positionSize.toFixed(4)}` : ''}
              </div>
            )}
          </>
        )}

        {drawing.type === 'text' && (
          <div className="field-group">
            <label className="field-label" htmlFor="dw-text">Note</label>
            <input
              id="dw-text"
              type="text"
              className="field"
              maxLength={200}
              value={drawing.meta?.text || ''}
              onChange={(e) => patchMeta({ text: e.target.value })}
            />
          </div>
        )}

        <label className="row-between">
          <span className="field-label">Locked</span>
          <input
            type="checkbox"
            className="checkbox"
            checked={Boolean(drawing.locked)}
            onChange={(e) => patch({ locked: e.target.checked })}
          />
        </label>

        {drawing.type === 'horizontal' && onArmAlert && (
          <button type="button" className="btn-ghost drawing-alert-btn" onClick={() => onArmAlert(drawing)}>
            🔔 Alert here
          </button>
        )}
        {alertStatus && <div className="field-hint">{alertStatus}</div>}
      </div>

      <div className="pivot-popover-footer" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="button" className="btn-ghost" onClick={onDelete}>Delete</button>
        <button type="button" className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

export default function DrawingToolbar({
  activeTool,
  onToolChange,
  magnet,
  onMagnetChange,
  hidden,
  onHiddenChange,
  onClearAll,
  selectedDrawing,
  popoverPos,
  onDrawingChange,
  onDeleteSelected,
  onClosePopover,
  onArmAlert,
  alertStatus,
}) {
  return (
    <>
      <div className="drawing-rail" role="toolbar" aria-label="Chart drawing tools">
        {RAIL_TOOLS.map((id) => (
          <button
            key={id}
            type="button"
            className={`drawing-tool-btn${activeTool === id ? ' active' : ''}`}
            title={DRAWING_TOOLS[id]?.label || id}
            aria-label={DRAWING_TOOLS[id]?.label || id}
            aria-pressed={activeTool === id}
            onClick={() => onToolChange(id)}
          >
            {TOOL_ICONS[id]}
          </button>
        ))}

        <div className="drawing-rail-sep" />

        <button
          type="button"
          className={`drawing-tool-btn${magnet ? ' active' : ''}`}
          title="Magnet snap (Alt)"
          aria-label="Magnet snap"
          aria-pressed={magnet}
          onClick={() => onMagnetChange(!magnet)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 14V8a6 6 0 0 1 12 0v6" />
            <path d="M6 14h3v4H6zM15 14h3v4h-3z" />
          </svg>
        </button>

        <button
          type="button"
          className={`drawing-tool-btn${hidden ? ' active' : ''}`}
          title={hidden ? 'Show drawings' : 'Hide drawings'}
          aria-label={hidden ? 'Show drawings' : 'Hide drawings'}
          onClick={() => onHiddenChange(!hidden)}
        >
          {hidden ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4 10 7-0.4 1.1-1.2 2.4-2.4 3.6M6.1 6.1C4.2 7.6 2.8 9.5 2 12c1 3 5 7 10 7 1.3 0 2.5-.3 3.6-.7" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="drawing-tool-btn danger"
          title="Clear all drawings"
          aria-label="Clear all drawings"
          onClick={onClearAll}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 12h10l1-12" />
          </svg>
        </button>
      </div>

      {selectedDrawing && (
        <DrawingStylePopover
          drawing={selectedDrawing}
          popoverPos={popoverPos}
          onChange={onDrawingChange}
          onDelete={onDeleteSelected}
          onClose={onClosePopover}
          onArmAlert={onArmAlert}
          alertStatus={alertStatus}
        />
      )}
    </>
  )
}
