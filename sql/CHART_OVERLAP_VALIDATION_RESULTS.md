# Chart Overlap Validation Results (SQL-First)

Ran using Supabase MCP against prod. Date: 2026-02-08.

## Tables Used by the Chart

| Table / object | Schema | Role |
|---------------|--------|------|
| **daily_demand_summary_product** | analytics | Materialized view. History: one row per `(delivery_date, product_id)` with summed quantities. Drives **bars** (Actual demand). |
| **demand_predictions** | analytics | Forecasts per `(forecasted_delivery_date, product_id)`. Drives **line** (Prediction). |

## SQL Used for Validation

Base file: `validate_chart_overlap.sql`. Key queries:

1. **Quick check** – Row counts and overlap count (with app-style date filters).
2. **A) History** – Row count, min/max date from `daily_demand_summary_product` (last 30 days, `delivery_date <= CURRENT_DATE`).
3. **B) Predictions** – Row count, min/max date from `demand_predictions` (latest per `forecasted_delivery_date`), range `CURRENT_DATE - 45` to `CURRENT_DATE + 30`.
4. **C) Overlap** – Count of dates that appear in **both** history and predictions (same filters as above).
5. **D) Expected chart data** – One row per date (union of history dates + prediction dates), with `actual` and `forecast` and flags `has_history` / `has_pred`.

## Results for DAHI100 (prod)

| Metric | Value |
|--------|--------|
| History rows (last 30 days, delivery_date ≤ today) | 30 |
| Prediction dates (in range) | 8 |
| **Overlapping dates (with app filters)** | **0** |

### Date ranges (app-style filters)

- **History**: min `2026-01-09`, max `2026-02-07` (30 days, up to “yesterday” on server date).
- **Predictions**: min `2026-02-08`, max `2026-02-15` (8 days, “today” onward).

So with the **current app filters**, history ends at 2026-02-07 and predictions start at 2026-02-08. There is **no overlapping date** in the data the app asks for → the chart cannot show both bar and line on the same day with current backend filters.

### When we allow “all dates” (query D)

The “expected chart data” query (D) builds the **union of all dates** from both sources and left-joins actual + forecast. That result **does** show overlap:

- **2026-02-09**: actual = 6, forecast = 560 → both `has_history` and `has_pred`.
- **2026-02-10**: actual = 32, forecast = 1850 → both.
- **2026-02-11**: actual = 4, forecast = 520 → both.

So the **data is capable of overlapping**: the materialized view has history for Feb 9–11, and predictions exist for the same dates. The chart component (e.g. Recharts ComposedChart with Bar + Line keyed by date) can show overlap **if** the frontend receives both history and predictions for those dates.

## Why the Chart Doesn’t Overlap in the App

- **History API** (`getHistory` in `supabaseClient.js`) uses:
  - `delivery_date >= (today - 30 days)` and **`delivery_date <= today`**.
- So the app **never requests** history for dates after “today”. Dates like Feb 9, 10, 11 are only in the predictions response; the history response stops at today (or yesterday if server date lags). So the frontend never gets “actual” for those days → no overlap.

## Can the Chart Overlap?

Yes. The chart merges by date in a single `byDate` map and renders Bar (actual) + Line (forecast). If the backend returns both history and predictions for the same dates, the chart will show overlapping bar and line.

## Recommended Fix (Validated by SQL)

1. **Extend the history fetch** so it includes dates that have predictions (e.g. extend to “today + N days” or to “max forecasted_delivery_date” in the requested range). Then the app will receive history for Feb 9–11 (and any other overlapping days), and the chart will show overlap.
2. **Optional**: Use a single “chart data” API or SQL view that returns the same shape as query D (one row per date with `actual` and `forecast`), so overlap is guaranteed by the backend.

## How to Re-validate with SQL

Run in Supabase SQL Editor or via Supabase MCP:

```sql
-- Overlap when history is extended to include prediction range (e.g. through today+30)
WITH history_dates AS (
  SELECT delivery_date AS dt
  FROM analytics.daily_demand_summary_product
  WHERE product_id = 'DAHI100'
    AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
    AND delivery_date <= (CURRENT_DATE + INTERVAL '30 days')  -- extended
),
pred_dates AS (
  SELECT DISTINCT forecasted_delivery_date AS dt
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
)
SELECT COUNT(*) AS overlapping_dates
FROM history_dates h
JOIN pred_dates p ON h.dt = p.dt;
```

With the extended history window, this count should be > 0 when predictions and history share dates (e.g. 3 for Feb 9–11).
