/**
 * One pie per warehouse: each pie shows Available vs Reserved for that warehouse.
 * Data = [{ warehouse_id, warehouse_name, total_quantity, total_available, product_count }].
 */
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const COLORS = { available: '#82ca9d', reserved: '#ffa94d' }

function WarehousePie({ row }) {
  const totalQuantity = Number(row.total_quantity) || 0
  const totalAvailable = Number(row.total_available) || 0
  const totalReserved = totalQuantity - totalAvailable

  const pieData = [
    { name: 'Available', value: totalAvailable, key: 'available' },
    { name: 'Reserved', value: totalReserved, key: 'reserved' },
  ].filter((d) => d.value > 0)

  if (pieData.length === 0) return null

  const total = totalQuantity || 1
  return (
    <div className="inventory-warehouse-pie">
      <h4 className="inventory-warehouse-pie-title">{row.warehouse_name || `Warehouse ${row.warehouse_id}`}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {pieData.map((entry) => (
              <Cell key={entry.key} fill={COLORS[entry.key] || '#888'} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString(), '']}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0]?.payload
              const pct = ((d?.value ?? 0) / total * 100).toFixed(1)
              return (
                <div className="inventory-chart-tooltip">
                  <div className="tooltip-label">{d?.name}</div>
                  <div>{Number(d?.value ?? 0).toLocaleString()} ({pct}%)</div>
                </div>
              )
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function InventoryStockChart({ data, loading }) {
  if (loading || !data?.length) return null

  return (
    <div className="inventory-chart-wrap">
      <h3 className="inventory-chart-title">Stock by warehouse (total vs available)</h3>
      <div className="inventory-pies-grid">
        {data.map((row) => (
          <WarehousePie key={row.warehouse_id} row={row} />
        ))}
      </div>
    </div>
  )
}
