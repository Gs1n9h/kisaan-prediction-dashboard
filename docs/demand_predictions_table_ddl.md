# analytics.demand_predictions — table description and DDL

**Grain:** One row per (prediction_date, product_id, forecasted_delivery_date).

| Column | Type | Description |
|--------|------|-------------|
| prediction_id | bigint | PK, identity |
| prediction_date | date | When forecast was generated |
| product_id | varchar(50) | Product (e.g. OR102) |
| product_short_name | varchar(100) | Display name |
| forecasted_delivery_date | date | Date being forecast |
| forecast | integer | Predicted quantity |
| confidence | numeric | Confidence score |
| historical_days_considered | integer | Days of history used |
| model_used | varchar(50) | Model id |
| reasoning | text | Explanation |
| openai_response_time_ms | integer | Optional |
| created_at | timestamp | Row insert time |

**Unique:** (prediction_date, product_id, forecasted_delivery_date)
