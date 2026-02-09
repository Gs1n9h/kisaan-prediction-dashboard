-- =============================================================================
-- Run daily aggregation manually (if cron did not run)
-- =============================================================================
-- The dashboard reads from analytics.daily_demand_summary_product (a
-- materialized view). That MV is refreshed by analytics.refresh_daily_demand_summary(),
-- which:
--   1) Inserts/updates orders that were created/modified since yesterday OR
--      have delivery_date >= yesterday into analytics.daily_demand_summary
--   2) Runs REFRESH MATERIALIZED VIEW CONCURRENTLY on daily_demand_summary_product
--
-- Scheduled runs are defined in the repo root:
--   kisaan_daily_demand_summary_bulk_load.sql (section 4: cron.schedule at 6:00 and 18:00)
-- If pg_cron is not enabled or the job didn't run, execute this in Supabase SQL Editor:
-- =============================================================================

SELECT analytics.refresh_daily_demand_summary();
