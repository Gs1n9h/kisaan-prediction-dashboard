-- =============================================================================
-- Grant authenticated role access to analytics schema (dashboard read-only)
-- Run this in Supabase SQL Editor (or as a migration) to fix "permission denied
-- for schema analytics". The app uses supabase.schema('analytics').from(...)
-- with the anon key while the user is signed in, so the authenticated role
-- must have USAGE on the schema and SELECT on the tables.
-- =============================================================================

GRANT USAGE ON SCHEMA analytics TO authenticated;

-- Tables (or views) used by the Kisaan prediction dashboard
GRANT SELECT ON analytics.demand_predictions TO authenticated;
GRANT SELECT ON analytics.daily_demand_summary_product TO authenticated;
GRANT SELECT ON analytics.odoo_warehouses TO authenticated;
GRANT SELECT ON analytics.odoo_inventory_snapshot TO authenticated;

-- Optional: if you use RLS on these tables, enable it and add policies.
-- By default this only grants SELECT; no INSERT/UPDATE/DELETE for authenticated.
--
-- To allow the dashboard "Sync data" button to run the refresh, the function
-- must run with definer rights (see fix_refresh_daily_demand_summary_permissions.sql):
--   ALTER FUNCTION analytics.refresh_daily_demand_summary() SET SECURITY DEFINER;
--   GRANT EXECUTE ON FUNCTION analytics.refresh_daily_demand_summary() TO authenticated;
