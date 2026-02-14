import { useMemo, useState } from 'react'

function dateStringAddDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Format YYYY-MM-DD to dd/mm/yy (day name) for display */
function formatDateLabel(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr
  const d = new Date(dateStr + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  const dayName = dayNames[d.getDay()]
  return `${dd}/${mm}/${yy} (${dayName})`
}

export default function AllProductsTable({ products, historyAll, predictionsAll, dateStart, numDays, onExportCSV }) {
  const todayStr = getTodayStr()
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' | 'desc'
  const [dataAlign, setDataAlign] = useState('left') // 'left' | 'center' | 'right'
  const [colSize, setColSize] = useState('normal') // 'compact' | 'normal' | 'wide'

  const sortedProducts = useMemo(() => {
    const list = [...(products || [])]
    const name = (p) => (p.product_short_name || p.product_id || '').toLowerCase()
    list.sort((a, b) => {
      const cmp = name(a).localeCompare(name(b))
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return list
  }, [products, sortDirection])

  const { dates, grid, csvContent } = useMemo(() => {
    const prods = sortedProducts
    const dates = []
    for (let i = 0; i < numDays; i++) {
      dates.push(dateStringAddDays(dateStart, i))
    }

    const historyByKey = new Map()
    for (const r of historyAll || []) {
      historyByKey.set(`${r.product_id}\t${r.delivery_date}`, Number(r.actual_order_quantity) || 0)
    }
    const predictionsByKey = new Map()
    const reasoningByKey = new Map()
    for (const r of predictionsAll || []) {
      const k = `${r.product_id}\t${r.forecasted_delivery_date}`
      predictionsByKey.set(k, Number(r.forecast) || 0)
      if (r.reasoning) reasoningByKey.set(k, r.reasoning)
    }

    const grid = {}
    for (const p of prods) {
      const pid = p.product_id
      grid[pid] = { product_id: pid, product_short_name: p.product_short_name || pid, cells: {} }
      for (const dt of dates) {
        const hist = historyByKey.get(`${pid}\t${dt}`)
        const pred = predictionsByKey.get(`${pid}\t${dt}`)
        const reasoning = reasoningByKey.get(`${pid}\t${dt}`) || null
        const hasActual = hist !== undefined && hist !== null
        const hasForecast = pred !== undefined && pred !== null
        let display = '—'
        if (hasActual && hasForecast) {
          display = `${hist} / ${pred}`
        } else if (hasActual) {
          display = String(hist)
        } else if (hasForecast) {
          display = String(pred)
        }
        let tooltip = ''
        if (hasActual && hasForecast) {
          tooltip = `Actual: ${hist}, Forecast: ${pred}`
        } else if (hasActual) {
          tooltip = `Actual: ${hist}`
        } else if (hasForecast) {
          tooltip = `Forecast: ${pred}`
        }
        if (reasoning && (hasForecast || hasActual)) {
          tooltip += (tooltip ? '. ' : '') + 'Prediction: ' + (reasoning.length > 300 ? reasoning.slice(0, 300) + '…' : reasoning)
        }
        grid[pid].cells[dt] = { actual: hist, forecast: pred, display, tooltip: tooltip || null }
      }
    }

    let csvContent = null
    if (prods?.length && dates.length) {
      const toCsvCell = (v) => {
        const s = v === '—' || v === '--' || v == null || v === '' ? 'no data' : String(v)
        return `"${s.replace(/"/g, '""')}"`
      }
      const dateHeaders = dates.map((dt) => formatDateLabel(dt))
      const header = ['Product', 'product_id', ...dateHeaders].join(',')
      const rows = prods.map((p) => {
        const row = grid[p.product_id]
        if (!row) return null
        const cells = dates.map((dt) => {
          const v = row.cells[dt]?.display
          return (v === '—' || v === '--' || v == null) ? 'no data' : String(v)
        })
        return [row.product_short_name || p.product_id, p.product_id, ...cells].map(toCsvCell).join(',')
      }).filter(Boolean)
      csvContent = [header, ...rows].join('\n')
    }

    return { dates, grid, csvContent }
  }, [sortedProducts, historyAll, predictionsAll, dateStart, numDays])

  function handleExportCSV() {
    if (!csvContent) return
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `demand-all-products-${dateStart}-${dateStringAddDays(dateStart, numDays - 1)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    onExportCSV?.()
  }

  if (!products?.length) {
    return (
      <div className="all-products-empty">
        No products to display.
      </div>
    )
  }

  return (
    <div className="all-products-table-wrap">
      <p className="all-products-legend">
        Single value in a cell is <strong>actual</strong> demand or <strong>forecast</strong>.{' '}
        <strong>x / y</strong> means <strong>Actual / Forecast</strong> for that date (when both exist). Hover a cell for details and prediction reasoning.
      </p>
      <div className="all-products-table-actions">
        <label className="filter-label table-sort-label">
          <span className="filter-name">Sort</span>
          <select
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value)}
            aria-label="Sort products"
            className="table-sort-select"
          >
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
        </label>
        <label className="filter-label table-align-label">
          <span className="filter-name">Align data</span>
          <select
            value={dataAlign}
            onChange={(e) => setDataAlign(e.target.value)}
            aria-label="Align table data"
            className="table-align-select"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="filter-label table-colsize-label">
          <span className="filter-name">Column size</span>
          <select
            value={colSize}
            onChange={(e) => setColSize(e.target.value)}
            aria-label="Column size"
            className="table-colsize-select"
          >
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-export-csv"
          onClick={handleExportCSV}
          disabled={!csvContent}
        >
          Export CSV
        </button>
      </div>
      <div className="all-products-table-scroll">
        <table className={`all-products-table align-data-${dataAlign} col-size-${colSize}`}>
          <thead>
            <tr>
              <th className="all-products-col-product">Product</th>
              {dates.map((dt) => (
                <th
                  key={dt}
                  className={`all-products-data-col ${dt === todayStr ? 'all-products-col-today' : ''}`}
                  title={formatDateLabel(dt)}
                >
                  {formatDateLabel(dt)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((p) => {
              const row = grid[p.product_id]
              if (!row) return null
              return (
                <tr key={p.product_id}>
                  <td className="all-products-col-product" title={p.product_short_name || p.product_id}>
                    {p.product_short_name || p.product_id}
                  </td>
                  {dates.map((dt) => {
                    const cell = row.cells[dt]
                    const { display, actual, forecast } = cell || {}
                    const hasBoth = actual != null && forecast != null
                    return (
                      <td
                        key={dt}
                        className={`all-products-data-col ${dt === todayStr ? 'all-products-col-today' : ''}`}
                        title={cell?.tooltip || undefined}
                      >
                        {hasBoth ? (
                          <span className="demand-cell-both">
                            <span className="demand-cell-actual">{actual}</span>
                            <span className="demand-cell-sep"> / </span>
                            <span className="demand-cell-forecast">{forecast}</span>
                          </span>
                        ) : (
                          display ?? '—'
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
