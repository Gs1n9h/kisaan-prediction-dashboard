import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { getProducts, getHistory, getPredictions, getPredictionRunDates, getPredictionsForRuns, getHistoryAllProducts, getPredictionsAllProducts, runRefreshDailyDemandSummary, getOdooWarehouses, getOdooInventorySnapshot } from '../supabaseClient'
import DemandChart from './DemandChart'
import AllProductsTable from './AllProductsTable'
import InventoryStockTable from './InventoryStockTable'
import InventoryStockChart from './InventoryStockChart'

function allProductsDateAddDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function allProductsTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultAllProductsDateRange() {
  const today = allProductsTodayStr()
  const from = allProductsDateAddDays(today, -6)
  return { from, to: today }
}

function daysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T12:00:00')
  const to = new Date(toStr + 'T12:00:00')
  const diff = Math.round((to - from) / (24 * 60 * 60 * 1000))
  return Math.max(0, diff) + 1
}

/** Parse "Raw Material / Card Boxes / Dividers" -> ["Raw Material", "Card Boxes", "Dividers"] */
function parseCategoryPath(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') return []
  return categoryName.split(/\s*\/\s*/).filter(Boolean)
}

export default function Dashboard() {
  const [products, setProducts] = useState([])
  const [productId, setProductId] = useState('')
  const [history, setHistory] = useState([])
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Date range filters: demand period (backwards), forecast ahead (forward)
  const [demandDaysBack, setDemandDaysBack] = useState(30)      // 30 | 60 | 90
  const [forecastDaysForward, setForecastDaysForward] = useState(30) // 7 | 30

  // Forecast run selection state
  const [availableRuns, setAvailableRuns] = useState([])
  const [selectedRuns, setSelectedRuns] = useState([])
  const [multiRunPredictions, setMultiRunPredictions] = useState({})
  const [showRunSelector, setShowRunSelector] = useState(false)

  // All-products table view: from/to date range and data
  const defaultRange = defaultAllProductsDateRange()
  const [allProductsDateFrom, setAllProductsDateFrom] = useState(defaultRange.from)
  const [allProductsDateTo, setAllProductsDateTo] = useState(defaultRange.to)
  const [historyAll, setHistoryAll] = useState([])
  const [predictionsAll, setPredictionsAll] = useState([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [syncingData, setSyncingData] = useState(false)

  // Odoo inventory (separate from demand/chart; does not affect existing sections)
  const [warehouses, setWarehouses] = useState([])
  const [inventoryRows, setInventoryRows] = useState([])
  const [inventorySnapshotAt, setInventorySnapshotAt] = useState(null)
  const [loadingInventory, setLoadingInventory] = useState(false)
  const [syncingInventory, setSyncingInventory] = useState(false)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null) // null = All stock
  const [selectedCategoryRoot, setSelectedCategoryRoot] = useState('') // '' = All; e.g. 'Raw Material'
  const [selectedCategorySub, setSelectedCategorySub] = useState('') // '' = All under root; e.g. 'Card Boxes'
  const [inventoryViewMode, setInventoryViewMode] = useState('by_warehouse') // 'by_warehouse' | 'by_product'
  const syncInventoryWebhookUrl = import.meta.env.VITE_N8N_SYNC_INVENTORY_WEBHOOK || ''

  useEffect(() => {
    getProducts()
      .then((list) => {
        setProducts(list)
        if (list.length > 0) setProductId(list[0].product_id)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!productId) {
      setHistory([])
      setPredictions([])
      setAvailableRuns([])
      setSelectedRuns([])
      setMultiRunPredictions({})
      return
    }
    setLoading(true)
    setError('')
    setSelectedRuns([]) // reset so we don't keep previous product's run selection
    setMultiRunPredictions({})
    Promise.all([
      getHistory(productId, demandDaysBack, forecastDaysForward),
      getPredictions(productId, { daysBack: demandDaysBack, daysForward: forecastDaysForward }),
      getPredictionRunDates(productId)
    ])
      .then(([h, p, runs]) => {
        setHistory(h)
        setPredictions(p)
        setAvailableRuns(runs)
        if (runs.length > 0) setSelectedRuns([runs[0]])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [productId, demandDaysBack, forecastDaysForward])
  
  // Fetch multi-run predictions when selection or date range changes
  useEffect(() => {
    if (!productId || selectedRuns.length === 0) {
      setMultiRunPredictions({})
      return
    }
    getPredictionsForRuns(productId, selectedRuns, { daysBack: demandDaysBack, daysForward: forecastDaysForward })
      .then(setMultiRunPredictions)
      .catch((e) => console.error('[Dashboard] Error fetching multi-run predictions:', e))
  }, [productId, selectedRuns, demandDaysBack, forecastDaysForward])

  // Fetch all-products data for table view
  useEffect(() => {
    if (!products.length) {
      setHistoryAll([])
      setPredictionsAll([])
      return
    }
    if (allProductsDateFrom > allProductsDateTo) {
      setHistoryAll([])
      setPredictionsAll([])
      return
    }
    setLoadingAll(true)
    Promise.all([
      getHistoryAllProducts(allProductsDateFrom, allProductsDateTo),
      getPredictionsAllProducts(allProductsDateFrom, allProductsDateTo)
    ])
      .then(([h, p]) => {
        setHistoryAll(h)
        setPredictionsAll(p)
      })
      .catch((e) => console.error('[Dashboard] Error fetching all-products data:', e))
      .finally(() => setLoadingAll(false))
  }, [products.length, allProductsDateFrom, allProductsDateTo])

  // Fetch Odoo warehouses and inventory snapshot (independent of demand/chart)
  function fetchInventory() {
    setLoadingInventory(true)
    Promise.all([getOdooWarehouses(), getOdooInventorySnapshot()])
      .then(([whList, rows]) => {
        setWarehouses(whList)
        setInventoryRows(rows)
        const latest = rows?.length ? rows.reduce((acc, r) => {
          const t = r.snapshot_at ? new Date(r.snapshot_at).getTime() : 0
          return t > acc ? t : acc
        }, 0) : null
        setInventorySnapshotAt(latest ? new Date(latest).toISOString() : null)
      })
      .catch((e) => console.error('[Dashboard] Inventory fetch error:', e))
      .finally(() => setLoadingInventory(false))
  }
  useEffect(() => { fetchInventory() }, [])

  const categoryRoots = (() => {
    const set = new Set()
    inventoryRows.forEach((r) => {
      const path = parseCategoryPath(r.category_name)
      if (path.length > 0) set.add(path[0])
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })()
  const categorySubs = (() => {
    if (!selectedCategoryRoot) return []
    const set = new Set()
    inventoryRows.forEach((r) => {
      const path = parseCategoryPath(r.category_name)
      if (path.length >= 2 && path[0] === selectedCategoryRoot) set.add(path[1])
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })()
  const filteredInventoryRows = inventoryRows.filter((r) => {
    if (selectedWarehouseId != null && r.warehouse_id !== selectedWarehouseId) return false
    const path = parseCategoryPath(r.category_name)
    if (selectedCategoryRoot) {
      if (path.length === 0 || path[0] !== selectedCategoryRoot) return false
      if (selectedCategorySub && (path.length < 2 || path[1] !== selectedCategorySub)) return false
    }
    return true
  })
  // Chart: aggregate by warehouse from filtered rows (respects category + warehouse filter)
  const inventoryByWarehouse = (() => {
    const byWh = new Map()
    for (const r of filteredInventoryRows) {
      const id = r.warehouse_id
      const name = r.warehouse_name || `Warehouse ${id}`
      if (!byWh.has(id)) {
        byWh.set(id, { warehouse_id: id, warehouse_name: name, total_quantity: 0, total_available: 0, product_count: 0 })
      }
      const row = byWh.get(id)
      row.total_quantity += Number(r.quantity) || 0
      row.total_available += Number(r.available_quantity) || 0
      row.product_count += 1
    }
    return Array.from(byWh.values()).sort((a, b) => (a.warehouse_name || '').localeCompare(b.warehouse_name || ''))
  })()
  // Aggregate by product (sum quantity, reserved, available across warehouses)
  const aggregatedByProduct = (() => {
    const byProduct = new Map()
    for (const r of filteredInventoryRows) {
      const id = r.odoo_product_id
      if (!byProduct.has(id)) {
        byProduct.set(id, {
          odoo_product_id: id,
          product_name: r.product_name,
          default_code: r.default_code,
          category_name: r.category_name,
          warehouse_id: null,
          warehouse_name: 'All warehouses',
          quantity: 0,
          reserved_quantity: 0,
          available_quantity: 0,
          snapshot_at: r.snapshot_at,
        })
      }
      const row = byProduct.get(id)
      row.quantity += Number(r.quantity) || 0
      row.reserved_quantity += Number(r.reserved_quantity) || 0
      row.available_quantity += Number(r.available_quantity) || 0
    }
    return Array.from(byProduct.values()).sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''))
  })()
  const inventoryTableRows = inventoryViewMode === 'by_product' ? aggregatedByProduct : filteredInventoryRows

  async function handleSyncInventory() {
    setSyncingInventory(true)
    try {
      if (syncInventoryWebhookUrl) {
        await fetch(syncInventoryWebhookUrl, { method: 'POST' })
        await new Promise((r) => setTimeout(r, 2000))
      }
      await fetchInventory()
    } catch (e) {
      console.error('[Dashboard] Sync inventory error:', e)
    } finally {
      setSyncingInventory(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  async function handleSyncData() {
    setSyncingData(true)
    try {
      await runRefreshDailyDemandSummary()
      if (productId) {
        const [h, p, runs] = await Promise.all([
          getHistory(productId, demandDaysBack, forecastDaysForward),
          getPredictions(productId, { daysBack: demandDaysBack, daysForward: forecastDaysForward }),
          getPredictionRunDates(productId)
        ])
        setHistory(h)
        setPredictions(p)
        setAvailableRuns(runs)
        if (runs.length > 0) setSelectedRuns([runs[0]])
      }
      const [hAll, pAll] = await Promise.all([
        getHistoryAllProducts(allProductsDateFrom, allProductsDateTo),
        getPredictionsAllProducts(allProductsDateFrom, allProductsDateTo)
      ])
      setHistoryAll(hAll)
      setPredictionsAll(pAll)
    } catch (e) {
      setError(e.message || 'Sync failed')
    } finally {
      setSyncingData(false)
    }
  }
  
  function toggleRunSelection(runDate) {
    setSelectedRuns(prev => {
      if (prev.includes(runDate)) {
        return prev.filter(d => d !== runDate)
      } else {
        return [...prev, runDate].sort().reverse() // Latest first
      }
    })
  }

  const productLabel = products.find((p) => p.product_id === productId)?.product_short_name || productId
  const [tab, setTab] = useState(() => {
    try { return window.sessionStorage.getItem('kisaan-dashboard-tab') === 'inventory' ? 'inventory' : 'demand' }
    catch { return 'demand' }
  })
  const setTabAndPersist = (t) => {
    setTab(t)
    try { window.sessionStorage.setItem('kisaan-dashboard-tab', t) } catch {}
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">Kisaan</div>
        <nav className="sidebar-nav" aria-label="Main">
          <button
            type="button"
            className={`sidebar-tab ${tab === 'demand' ? 'active' : ''}`}
            onClick={() => setTabAndPersist('demand')}
            aria-current={tab === 'demand' ? 'true' : undefined}
          >
            Demand predictions
          </button>
          <button
            type="button"
            className={`sidebar-tab ${tab === 'inventory' ? 'active' : ''}`}
            onClick={() => setTabAndPersist('inventory')}
            aria-current={tab === 'inventory' ? 'true' : undefined}
          >
            Inventory
          </button>
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="btn-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {error && <div className="dashboard-error">{error}</div>}

        {tab === 'demand' && (
          <>
            <header className="dashboard-header demand-header">
              <h1>Demand predictions</h1>
              <label className="product-select-label">
                Product
                <select
                  value={productId}
                  onChange={(e) => {
                    const next = e.target.value
                    setProductId(next)
                    if (next) setLoading(true)
                  }}
                  disabled={loading && products.length === 0}
                >
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_short_name || p.product_id} ({p.product_id})
                    </option>
                  ))}
                </select>
              </label>
            </header>

            {productId && (
              <section className="chart-section">
          <div className="chart-section-header">
            <h2>Demand & predictions — {productLabel}</h2>
            <div className="chart-filters">
              <label className="filter-label">
                <span className="filter-name">Demand period</span>
                <select
                  value={demandDaysBack}
                  onChange={(e) => setDemandDaysBack(Number(e.target.value))}
                  aria-label="Days of past demand to show"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </label>
              <label className="filter-label">
                <span className="filter-name">Forecast ahead</span>
                <select
                  value={forecastDaysForward}
                  onChange={(e) => setForecastDaysForward(Number(e.target.value))}
                  aria-label="Days of future forecast to show"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
            </div>
            {availableRuns.length > 0 && (
              <button 
                type="button" 
                className="btn-toggle-runs"
                onClick={() => setShowRunSelector(!showRunSelector)}
              >
                {showRunSelector ? 'Hide' : 'Compare'} forecast runs ({availableRuns.length})
              </button>
            )}
          </div>
          
          {showRunSelector && availableRuns.length > 0 && (
            <div className="run-selector">
              <p className="run-selector-hint">
                Select one or more forecast runs to overlay on the chart (latest selected by default):
              </p>
              <div className="run-selector-list">
                {availableRuns.map(runDate => (
                  <label key={runDate} className="run-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRuns.includes(runDate)}
                      onChange={() => toggleRunSelection(runDate)}
                    />
                    <span className={selectedRuns.includes(runDate) ? 'run-selected' : ''}>
                      Run {runDate} {runDate === availableRuns[0] ? '(latest)' : ''}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          
          {loading ? (
            <div className="chart-loading">Loading…</div>
          ) : (
            <DemandChart
              history={history}
              predictions={predictions}
              productLabel={productLabel}
              hasHistory={history.length > 0}
              hasPredictions={predictions.length > 0}
              multiRunPredictions={multiRunPredictions}
              selectedRuns={selectedRuns}
            />
          )}
        </section>
      )}

      {!productId && !loading && products.length > 0 && (
              <p className="dashboard-hint">Select a product to see history and predictions.</p>
            )}

            <section className="all-products-section">
        <h2>All products (table view)</h2>
        <div className="all-products-nav">
          <label className="filter-label">
            <span className="filter-name">From</span>
            <input
              type="date"
              value={allProductsDateFrom}
              onChange={(e) => setAllProductsDateFrom(e.target.value)}
              aria-label="From date"
              className="all-products-date-input"
            />
          </label>
          <label className="filter-label">
            <span className="filter-name">To</span>
            <input
              type="date"
              value={allProductsDateTo}
              onChange={(e) => setAllProductsDateTo(e.target.value)}
              aria-label="To date"
              className="all-products-date-input"
            />
          </label>
          <button
            type="button"
            className="btn-reset-7days"
            onClick={() => {
              const { from, to } = defaultAllProductsDateRange()
              setAllProductsDateFrom(from)
              setAllProductsDateTo(to)
            }}
            aria-label="Reset to last 7 days"
          >
            Reset to 7 days
          </button>
        </div>
        {loadingAll ? (
          <div className="all-products-loading">Loading…</div>
        ) : (
          <AllProductsTable
            products={products}
            historyAll={historyAll}
            predictionsAll={predictionsAll}
            dateStart={allProductsDateFrom}
            numDays={allProductsDateFrom <= allProductsDateTo ? daysBetween(allProductsDateFrom, allProductsDateTo) : 0}
          />
        )}
            </section>
          </>
        )}

        {tab === 'inventory' && (
          <section className="inventory-section">
            <h2>Inventory (Odoo stock)</h2>
        <div className="inventory-actions">
          <label className="filter-label inventory-warehouse-filter">
            <span className="filter-name">Warehouse</span>
            <select
              value={selectedWarehouseId ?? ''}
              onChange={(e) => setSelectedWarehouseId(e.target.value === '' ? null : Number(e.target.value))}
              aria-label="Filter by warehouse"
              className="inventory-warehouse-select"
            >
              <option value="">All stock</option>
              {(warehouses.length ? warehouses : inventoryRows.reduce((acc, r) => {
                if (!acc.some((x) => x.id === r.warehouse_id)) acc.push({ id: r.warehouse_id, name: r.warehouse_name, code: '' })
                return acc
              }, [])).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.code || `ID ${w.id}`}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-label inventory-category-filter">
            <span className="filter-name">Category</span>
            <select
              value={selectedCategoryRoot}
              onChange={(e) => { setSelectedCategoryRoot(e.target.value); setSelectedCategorySub(''); }}
              aria-label="Filter by category (root)"
              className="inventory-warehouse-select"
            >
              <option value="">All categories</option>
              {categoryRoots.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          {selectedCategoryRoot && categorySubs.length > 0 && (
            <label className="filter-label inventory-category-sub-filter">
              <span className="filter-name">Subcategory</span>
              <select
                value={selectedCategorySub}
                onChange={(e) => setSelectedCategorySub(e.target.value)}
                aria-label="Filter by subcategory"
                className="inventory-warehouse-select"
              >
                <option value="">All in {selectedCategoryRoot}</option>
                {categorySubs.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <label className="filter-label inventory-view-mode">
            <span className="filter-name">View</span>
            <select
              value={inventoryViewMode}
              onChange={(e) => setInventoryViewMode(e.target.value)}
              aria-label="View by warehouse or by product"
              className="inventory-warehouse-select"
            >
              <option value="by_warehouse">By warehouse</option>
              <option value="by_product">By product (sum all warehouses)</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-refresh-inventory"
            onClick={fetchInventory}
            disabled={loadingInventory}
          >
            {loadingInventory ? 'Loading…' : 'Refresh stock'}
          </button>
          {syncInventoryWebhookUrl && (
            <button
              type="button"
              className="btn-sync-inventory"
              onClick={handleSyncInventory}
              disabled={syncingInventory || loadingInventory}
              title="Trigger Odoo sync via n8n, then refresh"
            >
              {syncingInventory ? 'Syncing…' : 'Sync from Odoo'}
            </button>
          )}
        </div>
        {inventoryByWarehouse.length > 0 && (
          <InventoryStockChart
            data={inventoryByWarehouse}
            loading={loadingInventory}
            aggregated={inventoryViewMode === 'by_product'}
          />
        )}
        <InventoryStockTable
          rows={inventoryTableRows}
          snapshotAt={inventorySnapshotAt}
          loading={loadingInventory}
          aggregated={inventoryViewMode === 'by_product'}
            />
          </section>
        )}
      </main>
    </div>
  )
}
