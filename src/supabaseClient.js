import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

// Read from analytics schema
const analytics = () => supabase.schema('analytics')

// Use local date for filters so we don't exclude rows due to UTC (e.g. max delivery_date 2/25 must show)
function localDateString(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function localDateAtOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDateString(d)
}

export async function getProducts() {
  const { data, error } = await analytics()
    .from('demand_predictions')
    .select('product_id, product_short_name')
  if (error) throw error
  const seen = new Set()
  const list = (data || []).filter((r) => {
    const k = r.product_id
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  list.sort((a, b) => (b.product_id || '').localeCompare(a.product_id || ''))
  return list
}

/** Fetch actual demand for the product. Includes future delivery dates (up to today + daysForward) so chart can show actuals after today.
 * @param {string} [opts.fromStr] - Optional YYYY-MM-DD start (overrides daysBack)
 * @param {string} [opts.toStr] - Optional YYYY-MM-DD end (overrides daysForward)
 */
export async function getHistory(productId, daysBack = 30, daysForward = 30, opts = {}) {
  const fromStr = opts.fromStr ?? localDateAtOffset(-daysBack)
  const toStr = opts.toStr ?? localDateAtOffset(daysForward)
  console.log('[getHistory] Fetching for product:', productId, 'range:', fromStr, 'to', toStr)

  const { data, error } = await analytics()
    .from('daily_demand_summary_product')
    .select('delivery_date, planned_order_quantity, actual_order_quantity, delivered_order_quantity')
    .eq('product_id', productId)
    .gte('delivery_date', fromStr)
    .lte('delivery_date', toStr)
    .order('delivery_date', { ascending: true })
  
  if (error) {
    console.error('[getHistory] Error:', error)
    throw error
  }
  
  console.log('[getHistory] Raw rows returned:', data?.length || 0)
  if (data?.length > 0) {
    console.log('[getHistory] First row:', data[0])
    console.log('[getHistory] Last row:', data[data.length - 1])
  }
  
  // Normalize date to YYYY-MM-DD string so chart matches (Supabase may return Date or ISO string)
  const normalize = (r) => ({
    ...r,
    delivery_date: r.delivery_date == null ? '' : String(r.delivery_date).slice(0, 10),
  })
  const normalized = (data || []).map(normalize).filter((r) => r.delivery_date)
  console.log('[getHistory] Normalized rows:', normalized.length)
  return normalized
}

/**
 * Fetch predictions for the product in the given range. For each forecasted_delivery_date
 * we use the latest forecast (row with max prediction_date).
 * @param {number} daysBack - Include predictions from (today - daysBack) for overlap with history
 * @param {number} daysForward - Include predictions up to (today + daysForward), e.g. 7 or 30
 * @param {string} [opts.fromStr] - Optional YYYY-MM-DD start (overrides daysBack)
 * @param {string} [opts.toStr] - Optional YYYY-MM-DD end (overrides daysForward)
 */
export async function getPredictions(productId, { daysBack = 30, daysForward = 30, fromStr: optsFrom, toStr: optsTo } = {}) {
  const fromStr = optsFrom ?? localDateAtOffset(-daysBack)
  const toStr = optsTo ?? localDateAtOffset(daysForward)
  console.log('[getPredictions] Fetching for product:', productId, 'range:', fromStr, 'to', toStr)

  const { data: rows, error } = await analytics()
    .from('demand_predictions')
    .select('forecasted_delivery_date, forecast, confidence, reasoning, historical_days_considered, model_used, prediction_date')
    .eq('product_id', productId)
    .gte('forecasted_delivery_date', fromStr)
    .lte('forecasted_delivery_date', toStr)
  
  if (error) {
    console.error('[getPredictions] Error:', error)
    throw error
  }
  
  console.log('[getPredictions] Raw rows returned:', rows?.length || 0)
  if (rows?.length > 0) {
    console.log('[getPredictions] Sample rows (first 3):', rows.slice(0, 3))
    const uniquePredDates = [...new Set(rows.map(r => String(r.prediction_date).slice(0, 10)))]
    console.log('[getPredictions] Unique prediction_dates in response:', uniquePredDates.sort())
  }
  
  if (!rows?.length) return []

  const toKey = (d) => (d == null ? '' : String(d).slice(0, 10))
  // One row per forecasted_delivery_date: keep the one with latest prediction_date
  const byDeliveryDate = new Map()
  for (const r of rows) {
    const key = toKey(r.forecasted_delivery_date)
    if (!key) continue
    const existing = byDeliveryDate.get(key)
    const rPred = toKey(r.prediction_date)
    if (!existing || rPred > toKey(existing.prediction_date)) byDeliveryDate.set(key, r)
  }
  const list = Array.from(byDeliveryDate.values()).sort((a, b) =>
    toKey(a.forecasted_delivery_date).localeCompare(toKey(b.forecasted_delivery_date))
  )
  
  console.log('[getPredictions] After dedup (latest per delivery date):', list.length)
  if (list.length > 0) {
    console.log('[getPredictions] First forecast:', list[0])
    console.log('[getPredictions] Last forecast:', list[list.length - 1])
  }
  
  // Normalize dates to YYYY-MM-DD so chart merge is reliable
  return list.map((r) => ({
    ...r,
    forecasted_delivery_date: toKey(r.forecasted_delivery_date),
    prediction_date: toKey(r.prediction_date),
  }))
}

/**
 * Fetch actual demand for all products in a date range (for all-products table view).
 * @param {string} fromStr - YYYY-MM-DD
 * @param {string} toStr - YYYY-MM-DD
 */
export async function getHistoryAllProducts(fromStr, toStr) {
  const { data, error } = await analytics()
    .from('daily_demand_summary_product')
    .select('product_id, product_short_name, delivery_date, planned_order_quantity, actual_order_quantity, delivered_order_quantity')
    .gte('delivery_date', fromStr)
    .lte('delivery_date', toStr)
    .order('delivery_date', { ascending: true })

  if (error) throw error
  const normalize = (r) => ({
    ...r,
    delivery_date: r.delivery_date == null ? '' : String(r.delivery_date).slice(0, 10),
  })
  return (data || []).map(normalize).filter((r) => r.delivery_date)
}

/**
 * Fetch predictions for all products in a date range (for all-products table view).
 * One row per (product_id, forecasted_delivery_date) with latest prediction_date.
 * @param {string} fromStr - YYYY-MM-DD
 * @param {string} toStr - YYYY-MM-DD
 */
export async function getPredictionsAllProducts(fromStr, toStr) {
  const { data: rows, error } = await analytics()
    .from('demand_predictions')
    .select('product_id, forecasted_delivery_date, forecast, prediction_date, reasoning')
    .gte('forecasted_delivery_date', fromStr)
    .lte('forecasted_delivery_date', toStr)

  if (error) throw error
  if (!rows?.length) return []

  const toKey = (d) => (d == null ? '' : String(d).slice(0, 10))
  const byProductDate = new Map()
  for (const r of rows) {
    const key = `${r.product_id}\t${toKey(r.forecasted_delivery_date)}`
    const existing = byProductDate.get(key)
    const rPred = toKey(r.prediction_date)
    if (!existing || rPred > toKey(existing.prediction_date)) {
      byProductDate.set(key, {
        product_id: r.product_id,
        forecasted_delivery_date: toKey(r.forecasted_delivery_date),
        forecast: r.forecast,
        prediction_date: toKey(r.prediction_date),
        reasoning: r.reasoning || null,
      })
    }
  }
  return Array.from(byProductDate.values())
}

/**
 * Run the daily demand refresh (analytics.refresh_daily_demand_summary).
 * Refreshes the materialized view used by the dashboard. Requires EXECUTE on the function for the client role.
 */
export async function runRefreshDailyDemandSummary() {
  const { error } = await analytics().rpc('refresh_daily_demand_summary')
  if (error) throw error
}

/**
 * Get available prediction run dates for a product (for the dropdown selector). No date restriction.
 */
export async function getPredictionRunDates(productId) {
  console.log('[getPredictionRunDates] Fetching all runs for product:', productId)

  const { data: rows, error } = await analytics()
    .from('demand_predictions')
    .select('prediction_date')
    .eq('product_id', productId)
    .order('prediction_date', { ascending: false })
  
  if (error) {
    console.error('[getPredictionRunDates] Error:', error)
    throw error
  }
  
  const toKey = (d) => (d == null ? '' : String(d).slice(0, 10))
  const unique = [...new Set((rows || []).map(r => toKey(r.prediction_date)))].filter(Boolean)
  console.log('[getPredictionRunDates] Unique run dates:', unique)
  return unique
}

/**
 * Get predictions for specific run dates (for overlay comparison). Uses same date range as chart.
 * @param {string} [opts.fromStr] - Optional YYYY-MM-DD start
 * @param {string} [opts.toStr] - Optional YYYY-MM-DD end
 */
export async function getPredictionsForRuns(productId, selectedRunDates, { daysBack = 30, daysForward = 30, fromStr: optsFrom, toStr: optsTo } = {}) {
  const fromStr = optsFrom ?? localDateAtOffset(-daysBack)
  const toStr = optsTo ?? localDateAtOffset(daysForward)
  console.log('[getPredictionsForRuns] Fetching for product:', productId, 'runs:', selectedRunDates)

  const { data: rows, error } = await analytics()
    .from('demand_predictions')
    .select('forecasted_delivery_date, forecast, confidence, reasoning, prediction_date')
    .eq('product_id', productId)
    .in('prediction_date', selectedRunDates)
    .gte('forecasted_delivery_date', fromStr)
    .lte('forecasted_delivery_date', toStr)
  
  if (error) {
    console.error('[getPredictionsForRuns] Error:', error)
    throw error
  }
  
  console.log('[getPredictionsForRuns] Rows returned:', rows?.length || 0)
  
  const toKey = (d) => (d == null ? '' : String(d).slice(0, 10))
  
  // Group by prediction_date
  const byRun = {}
  for (const r of rows || []) {
    const runDate = toKey(r.prediction_date)
    if (!runDate) continue
    if (!byRun[runDate]) byRun[runDate] = []
    byRun[runDate].push({
      ...r,
      forecasted_delivery_date: toKey(r.forecasted_delivery_date),
      prediction_date: runDate,
    })
  }
  
  console.log('[getPredictionsForRuns] Grouped by run:', Object.keys(byRun))
  return byRun
}

// -----------------------------------------------------------------------------
// Odoo inventory (read from analytics.odoo_warehouses, analytics.odoo_inventory_snapshot)
// Does not affect existing demand/chart data.
// -----------------------------------------------------------------------------

export async function getOdooWarehouses() {
  const { data, error } = await analytics()
    .from('odoo_warehouses')
    .select('id, name, code, updated_at')
    .order('name')
  if (error) throw error
  return data || []
}

/**
 * @param {number | null} [warehouseId] - If set, only rows for this warehouse; otherwise all.
 */
export async function getOdooInventorySnapshot(warehouseId = null) {
  let q = analytics()
    .from('odoo_inventory_snapshot')
    .select('odoo_product_id, warehouse_id, warehouse_name, product_name, default_code, category_name, quantity, reserved_quantity, available_quantity, snapshot_at')
    .order('product_name')
  if (warehouseId != null) {
    q = q.eq('warehouse_id', warehouseId)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}
