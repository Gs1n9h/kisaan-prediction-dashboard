# Kisaan demand prediction dashboard

Unified view of **past demand** (last 30 days from `analytics.daily_demand_summary_product`), **predictions** (`analytics.demand_predictions`), and the **gap** between actuals and forecasts. Includes product dropdown and prediction reasoning on hover. Uses **Supabase** for auth and data.

## Context

- **Past history:** `analytics.daily_demand_summary_product` — one row per (delivery_date, product_id) with summed planned/actual/delivered quantities.
- **Predictions:** `analytics.demand_predictions` — one row per (prediction_date, product_id, forecasted_delivery_date) with forecast, confidence, reasoning.
- **Dashboard:** Line/bar chart of last 30 days actuals, overlay of predictions for overlapping dates, and gap (actual − forecast). Product selector from distinct products in `demand_predictions`. Hover on prediction points shows reasoning.

## Setup

1. **Copy env and set Supabase keys**
   ```bash
   cp .env.example .env
   # Edit .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
   ```

2. **Install and run**
   ```bash
   npm install
   npm run dev
   ```

3. **Supabase**
   - Create a project (or use existing). Enable **Email** auth (Magic Link and Password).
   - **Magic link:** In Auth → URL Configuration, set **Site URL** to your app URL and add it to **Redirect URLs** so the email link returns users to the app.
   - Expose the **analytics** schema in the API: Project → Settings → API → “Exposed schemas” (add `analytics`). The app uses `supabase.schema('analytics').from('...')` to read from the analytics tables.
   - **Grant permissions** so signed-in users (authenticated role) can read the analytics schema. In Supabase SQL Editor, run:
     ```sql
     -- See sql/grant_analytics_to_authenticated.sql
     GRANT USAGE ON SCHEMA analytics TO authenticated;
     GRANT SELECT ON analytics.demand_predictions TO authenticated;
     GRANT SELECT ON analytics.daily_demand_summary_product TO authenticated;
     ```
     Without this you’ll get “permission denied for schema analytics”. If you use RLS on these tables, add policies that allow `authenticated` to SELECT as needed.

## Folder layout

- `sql/` — Migration, alter, and dashboard queries for demand_predictions.
- `docs/` — Table DDL and demand-forecast context (moved from parent).
- `src/` — React app: auth, dashboard, chart with tooltip.

## Daily aggregation (history data)

The “last 30 days” chart reads from the materialized view **`analytics.daily_demand_summary_product`**. That view is refreshed by **`analytics.refresh_daily_demand_summary()`**, usually on a schedule (e.g. pg_cron at 6:00 and 18:00). If the daily aggregation did not run and the chart is empty or stale:

- **Run once manually** in Supabase SQL Editor: `SELECT analytics.refresh_daily_demand_summary();` (or use `sql/run_daily_aggregation_manually.sql`).
- **Scheduling and troubleshooting:** see `docs/daily_aggregation.md`.

## Deploy on Vercel

1. Push this repo to GitHub and **Import** the repo in [Vercel](https://vercel.com).
2. Set **Environment Variables** in the Vercel project:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon/public key
3. Deploy. The app uses Vite; build command and output are set in `vercel.json`. Client-side routing is handled by the rewrites.

## SQL (reference)

- `sql/grant_analytics_to_authenticated.sql` — **Run this first** so the dashboard can read the analytics schema (fixes “permission denied for schema analytics”).
- `sql/run_daily_aggregation_manually.sql` — Run the daily aggregation if cron didn’t run.
- `sql/demand_predictions_migration.sql` — Full migration to new schema.
- `sql/demand_predictions_alter_drop_source_user.sql` — Drop source_user_id, unique on 3 columns.
- `sql/dashboard_queries.sql` — Queries used by the dashboard (products, history, predictions).
