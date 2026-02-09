# Debugging and Enhancements - Kisaan Prediction Dashboard

## What Was Added

### 1. **Comprehensive Console Logging**
Added detailed logging at every step to help debug why data isn't appearing:

**In `supabaseClient.js`:**
- `getHistory()`: Logs product ID, date range, raw rows returned, first/last row, normalized count
- `getPredictions()`: Logs product ID, date range, raw rows, unique prediction dates, deduplication results
- `getPredictionRunDates()`: Logs available forecast run dates
- `getPredictionsForRuns()`: Logs multi-run fetching

**In `DemandChart.jsx`:**
- Logs history/prediction row counts
- Logs `byDate` map size after each merge step
- Logs final data array length and date range
- Logs sample data (first 3 and last 3 rows)

**How to use:**
Open browser DevTools → Console tab → Select a product → Watch the logs to see:
- What date range is being requested
- How many rows are returned from each table
- What the final merged data looks like
- Any date format issues or empty results

---

### 2. **Forecast Run Selector (Multi-Run Overlay)**

**Problem:** Forecasts change every day, so you need to compare different runs to see how predictions evolved.

**Solution:** Added a "Compare forecast runs" feature:

#### Features:
1. **Button to show/hide run selector** in the chart section header
2. **Checkbox list** of available forecast runs (sorted latest first)
3. **Multiple selection** - check any number of runs to overlay on the chart
4. **Auto-selects latest run** by default
5. **Color-coded lines**:
   - Latest selected run: solid yellow line
   - Other runs: dashed lines in different colors (orange, red, purple, blue, green)
6. **Enhanced tooltip** showing all forecasts for that date (one per run) with confidence scores

#### How to use:
1. Select a product from the dropdown
2. Click **"Compare forecast runs (N)"** button
3. Check/uncheck forecast runs (e.g. "Run 2026-02-07", "Run 2026-02-06")
4. Chart updates to show all selected runs overlaid
5. Hover over any date to see forecasts from all selected runs in the tooltip

#### Data shown:
- **Latest run** (solid line): Most recent forecast per delivery date
- **Older runs** (dashed lines): Historical forecasts for comparison
- **Tooltip**: Shows all forecasts for that date with run date and confidence

---

### 3. **New API Functions**

**In `supabaseClient.js`:**

```javascript
// Get all available forecast run dates for a product
getPredictionRunDates(productId)

// Get predictions for specific run dates (for overlay)
getPredictionsForRuns(productId, selectedRunDates)
```

These power the run selector and multi-run overlay.

---

### 4. **Enhanced Chart Data Structure**

Each data point now includes:
- `date`: Delivery date (YYYY-MM-DD)
- `actual`, `planned`, `delivered`: History values
- `forecast`: Primary forecast (from latest selected run)
- `forecastsByRun`: Object with forecasts from each selected run
  - Key: run date (e.g. "2026-02-07")
  - Value: `{ value, reasoning, confidence }`

This allows the chart to render multiple forecast lines and show all values in the tooltip.

---

## What to Check Now

### Step 1: Open Browser Console
1. Refresh the dashboard
2. Open DevTools (F12 or Cmd+Opt+I)
3. Go to Console tab
4. Select a product

### Step 2: Check the Logs

Look for these log groups:

**`[getHistory]`:**
```
[getHistory] Fetching for product: OR102
[getHistory] Date range: 2026-01-27 to 2026-02-26
[getHistory] Raw rows returned: 30
[getHistory] First row: { delivery_date: "2026-01-27", actual_order_quantity: 100, ... }
[getHistory] Last row: { delivery_date: "2026-02-25", ... }
[getHistory] Normalized rows: 30
```

**What to look for:**
- **Date range**: Should be (today - 30) to today in **your local timezone**
- **Raw rows returned**: Should be > 0 if the product has history
- **Last row date**: Should be close to today (e.g. 2026-02-25 if max in DB is 2/25)

**If history rows = 0:**
- Product might not exist in `analytics.daily_demand_summary_product`
- Or `product_id` doesn't match exactly (check case sensitivity)

---

**`[getPredictions]`:**
```
[getPredictions] Fetching for product: OR102
[getPredictions] Date range: 2026-01-12 to 2026-03-28
[getPredictions] Raw rows returned: 147
[getPredictions] Sample rows (first 3): [...]
[getPredictions] Unique prediction_dates in response: ["2026-02-05", "2026-02-06", "2026-02-07", ...]
[getPredictions] After dedup (latest per delivery date): 21
[getPredictions] First forecast: { forecasted_delivery_date: "2026-02-07", forecast: 50, prediction_date: "2026-02-07" }
[getPredictions] Last forecast: { forecasted_delivery_date: "2026-02-27", ... }
```

**What to look for:**
- **Date range**: (today - 45) to (today + 30) so it includes 7 Feb and overlaps history
- **Raw rows returned**: Should be > 0 if product has predictions
- **Unique prediction_dates**: Shows all forecast runs in the DB
- **After dedup**: One row per delivery date (using latest run for each)
- **First forecast date**: Should be 7 Feb or earlier if data exists

**If prediction rows = 0:**
- Product might not exist in `analytics.demand_predictions`
- Or date range excludes all forecasts (unlikely with -45/+30 window)

---

**`[DemandChart]`:**
```
[DemandChart] Rendering for product: OR102
[DemandChart] History rows: 30
[DemandChart] Prediction rows (latest): 21
[DemandChart] After adding history, byDate size: 30
[DemandChart] After adding predictions, byDate size: 40
[DemandChart] Final data array length: 40
[DemandChart] Date range: 2026-01-27 to 2026-02-27
[DemandChart] Sample data (first 3): [...]
[DemandChart] Sample data (last 3): [...]
```

**What to look for:**
- **byDate size after history**: Should match history row count
- **byDate size after predictions**: Should be history + prediction-only dates (e.g. 30 + 10 = 40)
- **Final data array length**: Should be the union of all dates (history + predictions)
- **Date range**: Should span from (today - 30) to the last forecast date

**If final data length = 0:**
- Both history and predictions are empty
- Check the previous logs to see which one failed

---

### Step 3: Check the Chart

With the logs, you should now see:
1. **History bars** from (today - 30) to today (e.g. Jan 27 to Feb 25)
2. **Forecast line** starting from first prediction date (e.g. Feb 7) and extending into the future
3. **Overlap** where both exist (e.g. Feb 7 to Feb 25 if you have history through 2/25 and forecasts from 7 Feb)

---

### Step 4: Try the Forecast Run Selector

1. Click **"Compare forecast runs (N)"** button
2. You'll see checkboxes for each available run date
3. Check multiple runs (e.g. Feb 7, Feb 6, Feb 5)
4. Chart shows:
   - Solid yellow line: Latest run (Feb 7)
   - Dashed orange line: Feb 6 run
   - Dashed red line: Feb 5 run
5. Hover over any date to see all 3 forecasts in the tooltip

---

## Common Issues and Fixes

### Issue 1: "No history for this product"
**Cause:** `product_id` in `daily_demand_summary_product` doesn't match what you selected.

**Fix:**
- Check the console: `[getHistory] Raw rows returned: 0`
- Run in Supabase SQL Editor:
  ```sql
  SELECT DISTINCT product_id FROM analytics.daily_demand_summary_product LIMIT 20;
  ```
- Compare with products in the dropdown (from `demand_predictions`)
- If they don't match, you need to align product IDs between the two tables

---

### Issue 2: "No predictions from 7 Feb"
**Cause:** The product doesn't have forecasts for 7 Feb in the DB.

**Fix:**
- Check the console: `[getPredictions] First forecast: { forecasted_delivery_date: "2026-02-09", ... }`
- This means forecasts start from Feb 9, not Feb 7
- Run in Supabase SQL Editor:
  ```sql
  SELECT 
    product_id, 
    prediction_date, 
    MIN(forecasted_delivery_date) as first_forecast,
    MAX(forecasted_delivery_date) as last_forecast,
    COUNT(*) as forecast_count
  FROM analytics.demand_predictions
  WHERE product_id = 'YOUR_PRODUCT_ID'
  GROUP BY product_id, prediction_date
  ORDER BY prediction_date DESC
  LIMIT 10;
  ```
- This shows which run dates exist and what delivery dates each run covers
- If no run includes Feb 7, then Feb 7 forecasts don't exist for this product

---

### Issue 3: History only goes to Feb 20, but DB has data to Feb 25
**Cause:** Date filter using UTC instead of local time.

**Fix:** Already implemented - we now use `localDateAtOffset()` for all filters. If you still see this:
- Check console: `[getHistory] Date range: ... to 2026-02-20`
- The `to` date should be **today in your local timezone** (not UTC)
- If it's wrong, check your system clock

---

### Issue 4: Chart is empty but logs show data
**Cause:** Data merge or chart rendering issue.

**Fix:**
- Check `[DemandChart] Final data array length: 0` → data merge failed
- Check `[DemandChart] Sample data` → see what the data looks like
- If data looks good but chart is blank, check browser console for React/Recharts errors

---

## Testing Checklist

- [ ] History shows from (today - 30) to today
- [ ] History includes Feb 25 (if that's the max in your DB)
- [ ] Forecast line starts from Feb 7 (or whatever first prediction date exists)
- [ ] Forecast line overlaps history (e.g. Feb 7-25 shows both bars and line)
- [ ] Forecast extends into future (beyond today)
- [ ] Clicking "Compare forecast runs" shows available runs
- [ ] Selecting multiple runs shows multiple lines on chart
- [ ] Tooltip shows all forecasts for overlaid runs
- [ ] Console logs show correct date ranges and row counts
- [ ] No "permission denied" errors

---

## Summary

You now have:
1. **Comprehensive logging** to see exactly what data is fetched and how it's merged
2. **Forecast run selector** to overlay multiple runs and compare how forecasts changed
3. **Enhanced tooltips** showing all forecasts for a date with run dates and confidence
4. **Local date handling** to avoid UTC timezone issues

**Next steps:**
1. Open the browser console and select a product
2. Review the logs to see what data is being fetched
3. If history or predictions are missing, use the SQL queries above to validate your Supabase tables
4. Try the forecast run selector to compare different runs
5. Report back with the console logs if you still see issues!
