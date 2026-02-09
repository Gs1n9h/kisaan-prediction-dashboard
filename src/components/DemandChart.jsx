import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'

// Normalize to YYYY-MM-DD so history and prediction dates match (Supabase may return Date or ISO string)
function toDateKey(d) {
  if (d == null) return ''
  if (typeof d === 'string') return d.slice(0, 10)
  if (typeof d === 'object' && d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

// Format date for tooltip: "YYYY-MM-DD (DayName)"
function formatDateWithDayOfWeek(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr
  const d = new Date(dateStr + 'T12:00:00') // noon to avoid TZ edge cases
  if (Number.isNaN(d.getTime())) return dateStr
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = dayNames[d.getDay()]
  return `${dateStr} (${day})`
}

// Calendar today + 1 (next day) as YYYY-MM-DD — used for highlight only; not derived from delivery_date
function getTodayPlusOneStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DemandChart({ history, predictions, productLabel, hasHistory, hasPredictions, multiRunPredictions = {}, selectedRuns = [] }) {
  console.log('[DemandChart] Rendering for product:', productLabel)
  console.log('[DemandChart] History rows:', history.length)
  console.log('[DemandChart] Prediction rows (latest):', predictions.length)
  console.log('[DemandChart] Selected runs:', selectedRuns)
  console.log('[DemandChart] Multi-run data:', Object.keys(multiRunPredictions))
  
  const byDate = new Map()
  history.forEach((r) => {
    const date = toDateKey(r.delivery_date)
    if (!date) return
    byDate.set(date, {
      date,
      actual: Number(r.actual_order_quantity) || 0,
      planned: Number(r.planned_order_quantity) || 0,
      delivered: Number(r.delivered_order_quantity) || 0,
      forecast: null,
      reasoning: null,
      confidence: null,
      forecastsByRun: {}, // Store multiple runs for overlay
    })
  })
  
  console.log('[DemandChart] After adding history, byDate size:', byDate.size)
  
  // 1) Always merge main predictions first (latest per day) so we keep full date range (no 38→37 drop)
  predictions.forEach((r) => {
    const date = toDateKey(r.forecasted_delivery_date)
    if (!date) return
    const existing = byDate.get(date)
    const forecastVal = Number(r.forecast) ?? 0
    const reasoning = r.reasoning || ''
    const confidence = r.confidence != null ? Number(r.confidence) : null
    const predictionRunDate = r.prediction_date != null ? toDateKey(r.prediction_date) : ''
    if (existing) {
      existing.forecast = forecastVal
      existing.reasoning = reasoning
      existing.confidence = confidence
      existing.predictionRunDate = predictionRunDate
    } else {
      byDate.set(date, {
        date,
        actual: 0,
        planned: 0,
        delivered: 0,
        forecast: forecastVal,
        reasoning,
        confidence,
        predictionRunDate,
        forecastsByRun: {},
      })
    }
  })
  
  // 2) Overlay selected run(s) from multiRunPredictions into forecastsByRun (and primary when first run selected)
  if (selectedRuns.length > 0 && Object.keys(multiRunPredictions).length > 0) {
    selectedRuns.forEach((runDate) => {
      const runForecasts = multiRunPredictions[runDate] || []
      runForecasts.forEach((r) => {
        const date = toDateKey(r.forecasted_delivery_date)
        if (!date) return
        const existing = byDate.get(date)
        const forecastVal = Number(r.forecast) ?? 0
        const entry = {
          value: forecastVal,
          reasoning: r.reasoning || '',
          confidence: r.confidence != null ? Number(r.confidence) : null,
        }
        if (existing) {
          existing.forecastsByRun[runDate] = entry
          if (runDate === selectedRuns[0]) {
            existing.forecast = forecastVal
            existing.reasoning = entry.reasoning
            existing.confidence = entry.confidence
            existing.predictionRunDate = runDate
          }
        } else {
          byDate.set(date, {
            date,
            actual: 0,
            planned: 0,
            delivered: 0,
            forecast: runDate === selectedRuns[0] ? forecastVal : 0,
            reasoning: runDate === selectedRuns[0] ? entry.reasoning : '',
            confidence: runDate === selectedRuns[0] ? entry.confidence : null,
            predictionRunDate: runDate === selectedRuns[0] ? runDate : '',
            forecastsByRun: { [runDate]: entry },
          })
        }
      })
    })
  }
  
  console.log('[DemandChart] After adding predictions, byDate size:', byDate.size)
  
  const todayPlusOneStr = getTodayPlusOneStr()
  const data = Array.from(byDate.entries())
    .map(([, v]) => ({ ...v, isTomorrow: v.date === todayPlusOneStr }))
    .filter((v) => v.date)
    .sort((a, b) => a.date.localeCompare(b.date))
  
  console.log('[DemandChart] Final data array length:', data.length)
  if (data.length > 0) {
    console.log('[DemandChart] Date range:', data[0].date, 'to', data[data.length - 1].date)
    console.log('[DemandChart] Sample data (first 3):', data.slice(0, 3))
    console.log('[DemandChart] Sample data (last 3):', data.slice(-3))
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const row = data.find((d) => d.date === label) || {}
    return (
      <div className="chart-tooltip">
        <strong>{formatDateWithDayOfWeek(label)}</strong>
        {payload.map((p) => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {p.value}
          </div>
        ))}
        {row.forecastsByRun && Object.keys(row.forecastsByRun).length > 0 && (
          <div className="tooltip-forecasts">
            <strong>Forecasts:</strong>
            {Object.entries(row.forecastsByRun)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([runDate, f]) => (
                <div key={runDate} className="tooltip-forecast-run">
                  <span className="run-label">Run {runDate}:</span> {f.value}
                  {f.confidence != null && <span className="confidence"> ({(f.confidence * 100).toFixed(0)}%)</span>}
                </div>
              ))
            }
          </div>
        )}
        {row.reasoning && (
          <div className="tooltip-reasoning" title={row.reasoning}>
            <strong>Reasoning:</strong> {row.reasoning.slice(0, 200)}
            {row.reasoning.length > 200 ? '…' : ''}
          </div>
        )}
      </div>
    )
  }

  const showPartialHint = (hasHistory !== undefined && !hasHistory) || (hasPredictions !== undefined && !hasPredictions)
  
  // Colors for different forecast runs (when overlaying)
  const runColors = ['#eab308', '#f97316', '#ef4444', '#a855f7', '#3b82f6', '#10b981']

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        No data for the date range. Check that the selected product has rows in{' '}
        <code>analytics.daily_demand_summary_product</code> and/or{' '}
        <code>analytics.demand_predictions</code>.
      </div>
    )
  }

  return (
    <>
      {showPartialHint && (
        <p className="chart-partial-hint">
          {hasHistory === false && 'No history for this product. '}
          {hasPredictions === false && 'No predictions for this product. '}
          Chart shows all actual demand and predictions; today + 1 is highlighted in amber.
        </p>
      )}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <ReferenceLine y={0} stroke="#ccc" />
          {data.some((d) => d.isTomorrow) && (
            <ReferenceLine x={todayPlusOneStr} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Today + 1', position: 'top' }} />
          )}
          <Bar dataKey="actual" name="Actual demand" fill="#3b82f6" radius={[2, 2, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={entry.date} fill={entry.isTomorrow ? '#f59e0b' : '#3b82f6'} />
            ))}
          </Bar>
          
          {/* Main forecast line (latest run or single forecast); tomorrow dot highlighted */}
          <Line
            type="monotone"
            dataKey="forecast"
            name={`Forecast ${selectedRuns.length > 0 ? `(run ${selectedRuns[0]})` : '(latest)'}`}
            stroke={runColors[0]}
            strokeWidth={2}
            dot={({ cx, cy, payload }) =>
              payload?.isTomorrow ? (
                <circle cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#b45309" strokeWidth={2} />
              ) : (
                <circle cx={cx} cy={cy} r={4} fill={runColors[0]} />
              )
            }
            connectNulls
          />
          
          {/* Additional forecast lines for comparison (when multiple runs selected) */}
          {selectedRuns.slice(1).map((runDate, idx) => (
            <Line
              key={runDate}
              type="monotone"
              dataKey={`forecastsByRun.${runDate}.value`}
              name={`Forecast (run ${runDate})`}
              stroke={runColors[(idx + 1) % runColors.length]}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  )
}
