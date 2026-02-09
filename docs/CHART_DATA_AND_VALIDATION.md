# Chart overlap, tables, SQL, and validation

## 1) Does the chart have the capability to overlap data?

**Yes.** The chart is built to overlap:

- **One shared x-axis** (calendar date).
- **Bars** = actual demand from `analytics.daily_demand_summary_product` (history).
- **Line(s)** = forecast from `analytics.demand_predictions` (latest per day, or selected runs).

For any date that has both history and prediction, the same row has `actual` (bar) and `forecast` (line), so they overlap by design. The app merges history and predictions by date into a single `data` array; Recharts draws both series from that array.


---

## 2) What tables are we using?

| Table | Schema | Purpose |
|-------|--------|---------|
| **daily_demand_summary_product** | analytics | History: one row per (delivery_date, product_id) with summed quantities. Drives the **bars** (Actual demand). |
| **demand_predictions** | analytics | Predictions: one row per (prediction_date, product_id, forecasted_delivery_date). Drives the **line(s)** (Forecast). |

Products for the dropdown come from `demand_predictions` (distinct product_id).

---

## 3) What SQL does the app use?

The app uses the Supabase client with `.schema('analytics')` and filters; below is the equivalent SQL.

### History (last 30 days, up to “today”)

- **Table:** `analytics.daily_demand_summary_product`
- **App date range:** `fromStr = today - 30`, `toStr = today` (local date).

```sql
SELECT delivery_date, planned_order_quantity, actual_order_quantity, delivered_order_quantity
FROM analytics.daily_demand_summary_product
WHERE product_id = :product_id
  AND delivery_date >= (CURRENT_DATE - INTERVAL '30 days')
  AND delivery_date <= CURRENT_DATE
ORDER BY delivery_date ASC;
```

(Replace `CURRENT_DATE` with your local “today” if you need to match the app exactly.)

### Predictions (latest forecast per delivery date)

- **Table:** `analytics.demand_predictions`
- **App date range:** `forecasted_delivery_date` from (today - 45) to (today + 30).

```sql
-- Step 1: get all rows in range
-- Step 2: keep one row per forecasted_delivery_date with MAX(prediction_date)

WITH pred AS (
  SELECT forecasted_delivery_date, forecast, confidence, reasoning, prediction_date
  FROM analytics.demand_predictions
  WHERE product_id = :product_id
    AND forecasted_delivery_date >= (CURRENT_DATE - INTERVAL '45 days')
    AND forecasted_delivery_date <= (CURRENT_DATE + INTERVAL '30 days')
)
SELECT DISTINCT ON (forecasted_delivery_date)
  forecasted_delivery_date, forecast, confidence, reasoning, prediction_date
FROM pred
ORDER BY forecasted_delivery_date, prediction_date DESC;
```

---

## 4) How to validate overlap with SQL (Supabase MCP or SQL Editor)

Use the validation script so the database results match what the chart should show.

**File:** `sql/validate_chart_overlap.sql`

Run it in **Supabase SQL Editor** (or via Supabase MCP `execute_sql` if you have it). It uses `product_id = 'DAHI100'`; change that if you test another product.

### What the script does

| Section | Purpose |
|--------|--------|
| **A** | History: row count, min/max date, sample rows (daily_demand_summary_product). |
| **B** | Predictions: row count, min/max date, sample rows (demand_predictions, latest per day). |
| **C** | Overlap: count and list of dates that appear in **both** history and predictions. |
| **D** | Expected chart data: one row per date (union of history + prediction dates) with actual and forecast. This is the dataset the chart should display. |
| **E** | Sanity: confirm product_id exists in both tables. |
| **F** | Quick summary: min/max dates and row counts per table for the product. |

### How to interpret results

1. **A and B:** If either returns 0 rows for your product, the chart will have no bars or no line for that product (check product_id and date ranges).
2. **C:** If “overlapping_dates” is 0 but both A and B have rows, the history and prediction date ranges don’t overlap (e.g. predictions start after the last history date). The chart can still show both, but there will be no dates with both bar and line.
3. **D:** Matches the chart’s logic: every date that should appear on the chart, with `actual` and `forecast`. Compare this to what you see on the chart (and to console logs: history count, prediction count, final data length and date range).

### Run in Supabase SQL Editor

1. Open your Supabase project → SQL Editor.
2. Paste the contents of `sql/validate_chart_overlap.sql`.
3. Replace `DAHI100` with your product_id if needed.
4. Run the script and check sections A–F.

### Using Supabase MCP

If your environment has Supabase MCP with `execute_sql`, you can run the same script (or individual sections) and use the result sets to validate overlap and expected chart data.

---

## 5) Quick checklist

- [ ] Run `validate_chart_overlap.sql` for the product you care about.
- [ ] Section A: history row count and date range look correct.
- [ ] Section B: prediction row count and date range look correct.
- [ ] Section C: overlapping_dates > 0 if you expect bars and line on the same dates.
- [ ] Section D: expected chart data has the same date range and total rows you expect on the chart.
- [ ] Section E: product exists in both tables.
- [ ] In the app: open DevTools → Console; check `[getHistory]` and `[getPredictions]` row counts and date ranges; compare with SQL results.

If the SQL shows overlapping dates and a full expected chart dataset but the app still doesn’t show overlap, the problem is in the front-end (e.g. date keys, merging, or Recharts config). If the SQL shows no overlap or missing data, fix the data or date ranges first.
