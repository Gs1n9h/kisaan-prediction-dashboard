-- =============================================================================
-- VALIDATION: Chart overlap (daily demand + predictions)
-- Run this in Supabase SQL Editor (or Supabase MCP execute_sql) to verify data.
-- Replace 'DAHI100' with your product_id where needed.
-- =============================================================================

-- QUICK CHECK: Run this first to see overlap count and row counts for DAHI100
SELECT
  (SELECT COUNT(*) FROM analytics.daily_demand_summary_product
   WHERE product_id = 'DAHI100' AND delivery_date >= (CURRENT_DATE - 30) AND delivery_date <= CURRENT_DATE) AS history_rows,
  (SELECT COUNT(DISTINCT forecasted_delivery_date) FROM analytics.demand_predictions
   WHERE product_id = 'DAHI100'
     AND forecasted_delivery_date >= (CURRENT_DATE - 45) AND forecasted_delivery_date <= (CURRENT_DATE + 30)) AS prediction_dates,
  (SELECT COUNT(*) FROM (
     SELECT d.delivery_date FROM analytics.daily_demand_summary_product d
     WHERE d.product_id = 'DAHI100' AND d.delivery_date >= (CURRENT_DATE - 30) AND d.delivery_date <= CURRENT_DATE
     INTERSECT
     SELECT p.forecasted_delivery_date FROM analytics.demand_predictions p
     WHERE p.product_id = 'DAHI100'
       AND p.forecasted_delivery_date >= (CURRENT_DATE - 45) AND p.forecasted_delivery_date <= (CURRENT_DATE + 30)
  ) x) AS overlapping_dates;

-- 1) TABLES USED BY THE CHART
--    - analytics.daily_demand_summary_product  (history: bars = actual demand)
--    - analytics.demand_predictions             (forecast: line)

-- 2) DATE RANGES (app uses local date; Supabase uses server date for CURRENT_DATE)
--    History:  delivery_date >= (CURRENT_DATE - 30) AND delivery_date <= CURRENT_DATE
--    Predictions: forecasted_delivery_date >= (CURRENT_DATE - 45) AND <= (CURRENT_DATE + 30)
--
-- To test a specific product, replace 'DAHI100' below with your product_id.

-- -----------------------------------------------------------------------------
-- A) History: what the app fetches (last 30 days up to today)
-- -----------------------------------------------------------------------------
SELECT
  'A) History (daily_demand_summary_product)' AS source,
  COUNT(*) AS row_count,
  MIN(delivery_date) AS min_date,
  MAX(delivery_date) AS max_date
FROM analytics.daily_demand_summary_product
WHERE product_id = 'DAHI100'
  AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
  AND delivery_date <= CURRENT_DATE;

-- Sample history rows (first 5 and last 5)
(SELECT 'history' AS source, delivery_date, actual_order_quantity AS value, NULL::integer AS forecast
 FROM analytics.daily_demand_summary_product
 WHERE product_id = 'DAHI100'
   AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
   AND delivery_date <= CURRENT_DATE
 ORDER BY delivery_date
 LIMIT 5)
UNION ALL
(SELECT 'history', delivery_date, actual_order_quantity, NULL
 FROM analytics.daily_demand_summary_product
 WHERE product_id = 'DAHI100'
   AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
   AND delivery_date <= CURRENT_DATE
 ORDER BY delivery_date DESC
 LIMIT 5);

-- -----------------------------------------------------------------------------
-- B) Predictions: what the app fetches (latest per forecasted_delivery_date)
-- -----------------------------------------------------------------------------
WITH pred_range AS (
  SELECT *
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
),
latest_per_day AS (
  SELECT DISTINCT ON (forecasted_delivery_date)
    forecasted_delivery_date,
    forecast,
    confidence,
    prediction_date
  FROM pred_range
  ORDER BY forecasted_delivery_date, prediction_date DESC
)
SELECT
  'B) Predictions (deduped latest per day)' AS source,
  COUNT(*) AS row_count,
  MIN(forecasted_delivery_date) AS min_date,
  MAX(forecasted_delivery_date) AS max_date
FROM latest_per_day;

-- Sample prediction rows
WITH pred_range AS (
  SELECT *
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
),
latest_per_day AS (
  SELECT DISTINCT ON (forecasted_delivery_date)
    forecasted_delivery_date, forecast, prediction_date
  FROM pred_range
  ORDER BY forecasted_delivery_date, prediction_date DESC
)
SELECT * FROM latest_per_day ORDER BY forecasted_delivery_date LIMIT 10;

-- -----------------------------------------------------------------------------
-- C) OVERLAP: dates that appear in BOTH (should show both bar and line)
-- -----------------------------------------------------------------------------
WITH history_dates AS (
  SELECT delivery_date AS dt
  FROM analytics.daily_demand_summary_product
  WHERE product_id = 'DAHI100'
    AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
    AND delivery_date <= CURRENT_DATE
),
pred_dates AS (
  SELECT DISTINCT forecasted_delivery_date AS dt
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
)
SELECT
  'C) Overlap (dates in both history and predictions)' AS description,
  COUNT(*) AS overlapping_dates
FROM history_dates h
JOIN pred_dates p ON h.dt = p.dt;

-- List overlapping dates
WITH history_dates AS (
  SELECT delivery_date AS dt
  FROM analytics.daily_demand_summary_product
  WHERE product_id = 'DAHI100'
    AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
    AND delivery_date <= CURRENT_DATE
),
pred_dates AS (
  SELECT DISTINCT forecasted_delivery_date AS dt
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
)
SELECT h.dt AS overlapping_date
FROM history_dates h
JOIN pred_dates p ON h.dt = p.dt
ORDER BY h.dt;

-- -----------------------------------------------------------------------------
-- D) EXPECTED CHART DATA: one row per date (union of history + prediction dates)
--    This is what the chart should display: same dates, actual + forecast.
-- -----------------------------------------------------------------------------
WITH history_dates AS (
  SELECT delivery_date AS dt
  FROM analytics.daily_demand_summary_product
  WHERE product_id = 'DAHI100'
    AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
    AND delivery_date <= CURRENT_DATE
),
pred_dates AS (
  SELECT DISTINCT forecasted_delivery_date AS dt
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
),
all_dates AS (
  SELECT dt FROM history_dates
  UNION
  SELECT dt FROM pred_dates
),
hist AS (
  SELECT delivery_date, actual_order_quantity, planned_order_quantity, delivered_order_quantity
  FROM analytics.daily_demand_summary_product
  WHERE product_id = 'DAHI100'
),
pred_latest AS (
  SELECT DISTINCT ON (forecasted_delivery_date)
    forecasted_delivery_date,
    forecast,
    prediction_date
  FROM analytics.demand_predictions
  WHERE product_id = 'DAHI100'
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
  ORDER BY forecasted_delivery_date, prediction_date DESC
)
SELECT
  a.dt AS date,
  COALESCE(h.actual_order_quantity, 0) AS actual,
  COALESCE(p.forecast, 0) AS forecast,
  p.prediction_date AS forecast_run_date,
  CASE WHEN h.delivery_date IS NOT NULL THEN 'history' ELSE '' END AS has_history,
  CASE WHEN p.forecasted_delivery_date IS NOT NULL THEN 'pred' ELSE '' END AS has_pred
FROM all_dates a
LEFT JOIN hist h ON h.delivery_date = a.dt
LEFT JOIN pred_latest p ON p.forecasted_delivery_date = a.dt
ORDER BY a.dt;

-- -----------------------------------------------------------------------------
-- E) Sanity: product_id in both tables? (replace DAHI100 to test another product)
-- -----------------------------------------------------------------------------
SELECT 'In daily_demand_summary_product' AS tbl, product_id, COUNT(*) AS cnt
FROM analytics.daily_demand_summary_product
WHERE product_id = 'DAHI100'
GROUP BY product_id
UNION ALL
SELECT 'In demand_predictions', product_id, COUNT(*)
FROM analytics.demand_predictions
WHERE product_id = 'DAHI100'
GROUP BY product_id;

-- -----------------------------------------------------------------------------
-- F) Quick overlap check: min/max dates per table for DAHI100
-- -----------------------------------------------------------------------------
SELECT
  'daily_demand_summary_product' AS tbl,
  MIN(delivery_date) AS min_date,
  MAX(delivery_date) AS max_date,
  COUNT(*) AS rows_for_DAHI100
FROM analytics.daily_demand_summary_product
WHERE product_id = 'DAHI100'
  AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
  AND delivery_date <= CURRENT_DATE
UNION ALL
SELECT
  'demand_predictions (latest per day)',
  (SELECT MIN(forecasted_delivery_date) FROM (
    SELECT DISTINCT ON (forecasted_delivery_date) forecasted_delivery_date
    FROM analytics.demand_predictions
    WHERE product_id = 'DAHI100'
      AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
      AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
    ORDER BY forecasted_delivery_date, prediction_date DESC
  ) s),
  (SELECT MAX(forecasted_delivery_date) FROM (
    SELECT DISTINCT ON (forecasted_delivery_date) forecasted_delivery_date
    FROM analytics.demand_predictions
    WHERE product_id = 'DAHI100'
      AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
      AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
    ORDER BY forecasted_delivery_date, prediction_date DESC
  ) s),
  (SELECT COUNT(*) FROM (
    SELECT DISTINCT ON (forecasted_delivery_date) forecasted_delivery_date
    FROM analytics.demand_predictions
    WHERE product_id = 'DAHI100'
      AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
      AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
    ORDER BY forecasted_delivery_date, prediction_date DESC
  ) s);
