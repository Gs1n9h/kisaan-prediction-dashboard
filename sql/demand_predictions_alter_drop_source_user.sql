-- =============================================================================
-- analytics.demand_predictions: drop source_user_id, unique on 3 columns only
-- Unique: (prediction_date, product_id, forecasted_delivery_date)
-- ON CONFLICT (prediction_date, product_id, forecasted_delivery_date) will work.
-- =============================================================================

ALTER TABLE analytics.demand_predictions
  DROP CONSTRAINT IF EXISTS demand_predictions_prediction_product_user_forecast_date_key;

ALTER TABLE analytics.demand_predictions
  DROP COLUMN IF EXISTS source_user_id;

ALTER TABLE analytics.demand_predictions
  ADD CONSTRAINT demand_predictions_prediction_product_forecast_date_key
  UNIQUE (prediction_date, product_id, forecasted_delivery_date);
