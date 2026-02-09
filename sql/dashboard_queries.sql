-- =============================================================================
-- Queries used by the Kisaan prediction dashboard (Supabase / app)
-- =============================================================================

-- 1) Distinct products for dropdown (from latest predictions)
SELECT DISTINCT product_id, product_short_name
FROM analytics.demand_predictions
ORDER BY product_id;

-- 2) Last 30 days history for a product (daily_demand_summary_product)
SELECT delivery_date, product_id, product_short_name,
       planned_order_quantity, actual_order_quantity, delivered_order_quantity,
       order_count, unique_customers, fulfillment_rate
FROM analytics.daily_demand_summary_product
WHERE product_id = :product_id
  AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
  AND delivery_date <= CURRENT_DATE
ORDER BY delivery_date;

-- 3) Predictions for a product (latest prediction_date, all forecasted_delivery_dates)
SELECT forecasted_delivery_date, forecast, confidence, reasoning,
       historical_days_considered, model_used, prediction_date
FROM analytics.demand_predictions
WHERE product_id = :product_id
  AND prediction_date = (SELECT MAX(prediction_date) FROM analytics.demand_predictions WHERE product_id = :product_id)
ORDER BY forecasted_delivery_date;
