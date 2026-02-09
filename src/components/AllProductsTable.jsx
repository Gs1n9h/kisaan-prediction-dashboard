import { useMemo } from 'react'

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

function formatDateLabel(dateStr) {
  if (!dateStr || dateStr.length < 10) return dateStr
  const d = new Date(dateStr + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = dayNames[d.getDay()]
  return `${dateStr} (${day})`
}

export default function AllProductsTable({ products, historyAll, predictionsAll, dateStart, numDays, onExportCSV }) {
  const todayStr = getTodayStr()

  const { dates, grid, csvContent } = useMemo(() => {
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
    for (const p of products || []) {
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
    if (products?.length && dates.length) {
      const dateHeaders = dates.map((dt) => formatDateLabel(dt))
      const header = ['Product', 'product_id', ...dateHeaders].join(',')
      const rows = (products || []).map((p) => {
        const row = grid[p.product_id]
        if (!row) return null
        const cells = dates.map((dt) => row.cells[dt]?.display ?? '—')
        return [row.product_short_name || p.product_id, p.product_id, ...cells].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
      }).filter(Boolean)
      csvContent = [header, ...rows].join('\n')
    }

    return { dates, grid, csvContent }
  }, [products, historyAll, predictionsAll, dateStart, numDays])

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
        <table className="all-products-table">
          <thead>
            <tr>
              <th className="all-products-col-product">Product</th>
              {dates.map((dt) => (
                <th
                  key={dt}
                  className={dt === todayStr ? 'all-products-col-today' : ''}
                  title={formatDateLabel(dt)}
                >
                  {formatDateLabel(dt)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const row = grid[p.product_id]
              if (!row) return null
              return (
                <tr key={p.product_id}>
                  <td className="all-products-col-product" title={p.product_short_name || p.product_id}>
                    {p.product_short_name || p.product_id}
                  </td>
                  {dates.map((dt) => (
                    <td
                      key={dt}
                      className={dt === todayStr ? 'all-products-col-today' : ''}
                      title={row.cells[dt]?.tooltip || undefined}
                    >
                      {row.cells[dt]?.display ?? '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
