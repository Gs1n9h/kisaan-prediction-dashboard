import { useMemo, useState } from 'react'

function formatDDMMYY(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

/**
 * Tabular view of products with current stock (from Odoo sync).
 * Shows one row per product per warehouse, or aggregated by product (sum across warehouses) when aggregated=true.
 */
export default function InventoryStockTable({ rows, snapshotAt, loading, aggregated = false, viewMode = 'by_warehouse', warehouseOrder = null }) {
  const [sortDirection, setSortDirection] = useState('asc')
  const [dataAlign, setDataAlign] = useState('left')
  const [colSize, setColSize] = useState('normal')

  const sortedRows = useMemo(() => {
    const list = [...(rows || [])]
    const name = (r) => (r.product_name || r.odoo_product_id || '').toLowerCase()
    list.sort((a, b) => {
      const cmp = name(a).localeCompare(name(b))
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return list
  }, [rows, sortDirection])
  if (loading) {
    return <div className="inventory-loading">Loading stock…</div>
  }
  if (!rows?.length) {
    return (
      <div className="inventory-empty">
        No inventory data yet. Run the Odoo sync (cron or n8n) or use “Refresh stock” after syncing.
      </div>
    )
  }

  const byProductBothWh = viewMode === 'by_product_both_warehouses'
  const qtyHeader = byProductBothWh && warehouseOrder?.length
    ? `Quantity (${warehouseOrder.map(([, name]) => name || 'WH').join(' / ')})`
    : 'Quantity'

  return (
    <div className="inventory-table-wrap">
      <div className="inventory-table-toolbar">
        <label className="filter-label table-sort-label">
          <span className="filter-name">Sort</span>
          <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value)} aria-label="Sort products" className="table-sort-select">
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
        </label>
        <label className="filter-label table-align-label">
          <span className="filter-name">Align data</span>
          <select value={dataAlign} onChange={(e) => setDataAlign(e.target.value)} aria-label="Align table data" className="table-align-select">
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label className="filter-label table-colsize-label">
          <span className="filter-name">Column size</span>
          <select value={colSize} onChange={(e) => setColSize(e.target.value)} aria-label="Column size" className="table-colsize-select">
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </select>
        </label>
      </div>
      {snapshotAt && (
        <p className="inventory-snapshot-at">
          Last synced: {formatDDMMYY(new Date(snapshotAt))}
          {aggregated && ' · Quantities summed across all warehouses'}
          {byProductBothWh && ' · One row per product, quantities as warehouse1/warehouse2/…'}
        </p>
      )}
      <div className="inventory-table-scroll">
        <table className={`inventory-table align-data-${dataAlign} col-size-${colSize}`}>
          <thead>
            <tr>
              <th className="inv-col-product">Product</th>
              <th className="inv-col-code inv-col-data">Code</th>
              <th className="inv-col-category inv-col-data">Category</th>
              {!byProductBothWh && <th className="inv-col-warehouse inv-col-data">Warehouse</th>}
              <th className="inv-col-qty inv-col-data">{qtyHeader}</th>
              {!byProductBothWh && (
                <>
                  <th className="inv-col-reserved inv-col-data">Reserved</th>
                  <th className="inv-col-available inv-col-data">Available</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={byProductBothWh ? `both-${row.odoo_product_id}-${i}` : row.warehouse_id != null ? `${row.odoo_product_id}-${row.warehouse_id}-${i}` : `agg-${row.odoo_product_id}-${i}`}>
                <td className="inv-col-product" title={row.product_name}>
                  {row.product_name || '—'}
                </td>
                <td className="inv-col-code inv-col-data">{row.default_code || '—'}</td>
                <td className="inv-col-category inv-col-data">{row.category_name || '—'}</td>
                {!byProductBothWh && (
                  <td className="inv-col-warehouse inv-col-data">{row.warehouse_name || '—'}</td>
                )}
                <td className="inv-col-qty inv-col-data">
                  {byProductBothWh ? (row.quantity_by_warehouse ?? '—') : (Number(row.quantity) ?? '—')}
                </td>
                {!byProductBothWh && (
                  <>
                    <td className="inv-col-reserved inv-col-data">{Number(row.reserved_quantity) ?? '—'}</td>
                    <td className="inv-col-available inv-col-data">{Number(row.available_quantity) ?? '—'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
