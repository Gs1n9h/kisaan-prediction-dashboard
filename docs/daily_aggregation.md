# Daily aggregation for the dashboard

The dashboard’s “last 30 days” chart reads from **`analytics.daily_demand_summary_product`**, a **materialized view** that rolls up `analytics.daily_demand_summary` by `(delivery_date, product_id)`.

## What “daily aggregation” does

1. **Base table** `analytics.daily_demand_summary` is filled by:
   - A one-time **bulk load** (see repo root: `kisaan_daily_demand_summary_bulk_load.sql`).
   - A **daily refresh** that appends/updates **yesterday’s** rows.

2. The **refresh function** `analytics.refresh_daily_demand_summary()`:
   - Inserts/updates yesterday’s data into `analytics.daily_demand_summary`.
   - Runs `REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.daily_demand_summary_product`.

If this doesn’t run, the dashboard will show no (or stale) history for recent dates.

## If the daily aggregation did not run

**Run it once manually** in the Supabase SQL Editor:

```sql
SELECT analytics.refresh_daily_demand_summary();
```

Or use the script in this repo: **`sql/run_daily_aggregation_manually.sql`**.

## Scheduling (cron)

The refresh is intended to run on a schedule. In the **same database** where the bulk load was applied, the cron jobs are defined in the repo root file:

**`kisaan_daily_demand_summary_bulk_load.sql`** (section 4):

- `refresh_daily_demand_summary_morning` — 06:00 daily  
- `refresh_daily_demand_summary_evening` — 18:00 daily  

They call:

```sql
SELECT analytics.refresh_daily_demand_summary();
```

**Requirements:**

- **pg_cron** must be enabled (Supabase: Database → Extensions → enable `pg_cron` if available).
- The cron section of `kisaan_daily_demand_summary_bulk_load.sql` must have been executed in that database so the two jobs exist.

If you’re on a host that doesn’t support pg_cron, use an external scheduler (e.g. n8n, GitHub Actions, or a cron on a server) to call the Supabase SQL API or a small backend that runs `SELECT analytics.refresh_daily_demand_summary();` once or twice per day.
