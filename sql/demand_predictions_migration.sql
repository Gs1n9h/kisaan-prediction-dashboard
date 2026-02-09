-- =============================================================================
-- analytics.demand_predictions: migrate to scalable schema (one row per forecast day)
-- Old: one row per (prediction_date, product_id, source_user_id) with 2 days in columns.
-- New: one row per (prediction_date, product_id, forecasted_delivery_date).
-- =============================================================================

TRUNCATE TABLE analytics.demand_predictions;

ALTER TABLE analytics.demand_predictions
  DROP CONSTRAINT IF EXISTS demand_predictions_prediction_date_product_id_uniq,
  DROP CONSTRAINT IF EXISTS demand_predictions_prediction_date_product_id_source_user_i_key;

DROP INDEX IF EXISTS analytics.idx_predictions_tomorrow;

ALTER TABLE analytics.demand_predictions
  DROP COLUMN IF EXISTS tomorrow_date,
  DROP COLUMN IF EXISTS tomorrow_forecast,
  DROP COLUMN IF EXISTS tomorrow_confidence,
  DROP COLUMN IF EXISTS tomorrow_reasoning,
  DROP COLUMN IF EXISTS day_after_date,
  DROP COLUMN IF EXISTS day_after_forecast,
  DROP COLUMN IF EXISTS day_after_confidence,
  DROP COLUMN IF EXISTS day_after_reasoning,
  DROP COLUMN IF EXISTS total_historical_days;

ALTER TABLE analytics.demand_predictions
  ADD COLUMN IF NOT EXISTS forecasted_delivery_date date,
  ADD COLUMN IF NOT EXISTS forecast integer,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS historical_days_considered integer,
  ADD COLUMN IF NOT EXISTS reasoning text;

ALTER TABLE analytics.demand_predictions
  DROP CONSTRAINT IF EXISTS demand_predictions_prediction_product_user_forecast_date_key;

ALTER TABLE analytics.demand_predictions
  ADD CONSTRAINT demand_predictions_prediction_product_forecast_date_key
  UNIQUE (prediction_date, product_id, forecasted_delivery_date);

CREATE INDEX IF NOT EXISTS idx_demand_predictions_forecasted_delivery_date
  ON analytics.demand_predictions (forecasted_delivery_date DESC);

CREATE INDEX IF NOT EXISTS idx_demand_predictions_product_forecast_date
  ON analytics.demand_predictions (product_id, forecasted_delivery_date DESC);
