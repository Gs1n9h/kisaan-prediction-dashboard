/**
 * Tabular view of products with current stock (from Odoo sync).
 * Shows one row per product per warehouse, or aggregated by product (sum across warehouses) when aggregated=true.
 */
export default function InventoryStockTable({ rows, snapshotAt, loading, aggregated = false }) {
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

  return (
    <div className="inventory-table-wrap">
      {snapshotAt && (
        <p className="inventory-snapshot-at">
          Last synced: {new Date(snapshotAt).toLocaleString()}
          {aggregated && ' · Quantities summed across all warehouses'}
        </p>
      )}
      <div className="inventory-table-scroll">
        <table className="inventory-table">
          <thead>
            <tr>
              <th className="inv-col-product">Product</th>
              <th className="inv-col-code">Code</th>
              <th className="inv-col-category">Category</th>
              <th className="inv-col-warehouse">Warehouse</th>
              <th className="inv-col-qty">Quantity</th>
              <th className="inv-col-reserved">Reserved</th>
              <th className="inv-col-available">Available</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.warehouse_id != null ? `${row.odoo_product_id}-${row.warehouse_id}-${i}` : `agg-${row.odoo_product_id}-${i}`}>
                <td className="inv-col-product" title={row.product_name}>
                  {row.product_name || '—'}
                </td>
                <td className="inv-col-code">{row.default_code || '—'}</td>
                <td className="inv-col-category">{row.category_name || '—'}</td>
                <td className="inv-col-warehouse">{row.warehouse_name || '—'}</td>
                <td className="inv-col-qty">{Number(row.quantity) ?? '—'}</td>
                <td className="inv-col-reserved">{Number(row.reserved_quantity) ?? '—'}</td>
                <td className="inv-col-available">{Number(row.available_quantity) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
