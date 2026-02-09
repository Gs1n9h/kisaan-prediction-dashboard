-- =============================================================================
-- Odoo inventory snapshot tables (sync from Odoo; dashboard reads).
-- Run in Supabase SQL Editor. Sync script uses service_role; dashboard uses
-- authenticated with SELECT only. Does not affect existing demand/chart tables.
-- =============================================================================

-- Warehouses (current list from Odoo; upserted on each sync)
CREATE TABLE IF NOT EXISTS analytics.odoo_warehouses (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Latest stock per product per warehouse (one row per product+warehouse; upserted on sync)
CREATE TABLE IF NOT EXISTS analytics.odoo_inventory_snapshot (
  odoo_product_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  warehouse_name TEXT NOT NULL,
  product_name TEXT,
  default_code TEXT,
  category_name TEXT,
  quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  available_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (odoo_product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_odoo_inv_snapshot_warehouse ON analytics.odoo_inventory_snapshot(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_odoo_inv_snapshot_category ON analytics.odoo_inventory_snapshot(category_name);
CREATE INDEX IF NOT EXISTS idx_odoo_inv_snapshot_snapshot_at ON analytics.odoo_inventory_snapshot(snapshot_at);

-- Dashboard reads with authenticated role
GRANT SELECT ON analytics.odoo_warehouses TO authenticated;
GRANT SELECT ON analytics.odoo_inventory_snapshot TO authenticated;

-- Sync script (run with service_role key) needs INSERT/UPDATE/DELETE
-- Service role has full access by default; no extra grant needed if sync uses service_role.
