# Odoo inventory scripts

Local-first Python scripts to discover warehouses and stock from Odoo. **Read-only**: we never create, write, or update anything in Odoo. Designed for **local testing** now and **n8n** later (run the same scripts from an n8n Execute Command or Python node).

We **rely on inventory only** for the list of products — no separate product catalog is required. The source of truth is what appears in stock (`sync_stock.py`).

## Setup (local)

1. **Create a virtualenv and install deps** (recommended):

   ```bash
   cd odoo_inventory
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure Odoo** (use API key as password):

   ```bash
   cp .env.example .env
   # Edit .env: set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD (API key)
   ```

   - `ODOO_URL`: e.g. `https://mycompany.odoo.com`
   - `ODOO_DB`: database name (often the subdomain, e.g. `mycompany`)
   - `ODOO_USERNAME`: your login (email for Odoo Online)
   - `ODOO_PASSWORD`: API key from **Preferences → Account Security → New API Key** (or account password)

## Scripts (all dynamic — new warehouses/products are picked up automatically)

| Script | Purpose |
|--------|--------|
| `list_warehouses.py` | List all warehouses (id, name, code). Use to see how many warehouses you have. |
| `sync_stock.py` | **Primary.** Fetch current stock by warehouse from inventory only; outputs JSON (quantity, reserved, available, **category_name** per product per warehouse). All products in stock are included; filter by category at your end using `category_name`. |
| `list_products.py` | Optional. List products from Odoo (id, default_code, name) if you need to build a mapping later. Not required for stock sync; inventory is the source of truth. |
| `list_inventory_fields.py` | List **all columns** for inventory models (`stock.quant`, `stock.lot`, `product.product`, `stock.warehouse`). Use to discover available fields (e.g. use-by/expiry). Run: `python list_inventory_fields.py --pretty` or pass model names. |
| `list_product_by_id.py` | Read **one product** by ID with all fields (default ID 959). Output is JSON; binary/long strings are replaced with placeholders. Example: `python list_product_by_id.py 959`. |

### Run locally

```bash
# From repo root or odoo_inventory/
python odoo_inventory/list_warehouses.py
python odoo_inventory/sync_stock.py
python odoo_inventory/sync_stock.py -o stock.json
# Optional: list products (e.g. for mapping)
python odoo_inventory/list_products.py --stockable --limit 200
# List all columns for inventory models (discover use_date, expiration_date, etc.)
python odoo_inventory/list_inventory_fields.py --pretty
# Read one product with all fields (default id 959)
python odoo_inventory/list_product_by_id.py
python odoo_inventory/list_product_by_id.py 123
```

Output is JSON (stdout or file). Products in `sync_stock` output come from inventory only (no separate product list). Use `default_code` in the output if you later add a mapping to Kisaan product IDs.

## Syncing to Supabase (DB)

1. **Create tables:** Run [kisaan_prediction_dashboard/sql/odoo_inventory_schema.sql](../kisaan_prediction_dashboard/sql/odoo_inventory_schema.sql) in the Supabase SQL Editor (same project as the dashboard).
2. **Env:** Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (service role key) in `.env`.
3. **Run:** `python sync_stock_to_db.py` — fetches from Odoo (read-only) and upserts into `analytics.odoo_warehouses` and `analytics.odoo_inventory_snapshot`.
4. **Cron (e.g. every 6h):** Use n8n (schedule + Execute Command running this script) or system cron. The dashboard shows data from these tables and has a “Refresh stock” button; optional “Sync from Odoo” appears if `VITE_N8N_SYNC_INVENTORY_WEBHOOK` is set (webhook triggers n8n workflow that runs the sync).

## Using from n8n later

- Run the same scripts from n8n:
  - **Execute Command** node: `python /path/to/odoo_inventory/sync_stock.py -o /tmp/stock.json` (then read the file in the next node), or
  - **Code (Python)** node: paste the script logic and use `$env.ODOO_URL` etc. from n8n credentials/env.
- Set Odoo credentials in n8n (environment variables or credentials) so the scripts see `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`.
- Optional: add a step to write the JSON to Supabase (e.g. `warehouses` and `inventory_snapshot` tables) so the Kisaan dashboard can show stock; that will be added in a follow-up (Supabase schema + sync step).

## Notes

- **Read-only**: Scripts only use Odoo read operations (`read`, `search_read`, `search`, etc.). Nothing is ever created, updated, or deleted in Odoo.
- **Inventory-only for products**: We do not maintain or require a separate product list. The list of products is whatever appears in inventory (from `sync_stock.py`). New products in stock are picked up automatically.
- **External API**: Only available on Odoo **Custom** plans. Not on One App Free or Standard.
- **Category**: Each row includes `category_name` so you can filter (e.g. Dairy) in your own code or dashboard.
- **New warehouses**: No code change needed; scripts query Odoo each run and iterate over whatever warehouses exist.

## Use-by / expiry dates and listing all columns

**Use-by and expiry are not on `stock.quant`**; they live on **`stock.lot`** (lots/serial numbers). In Odoo, typical fields on `stock.lot` include:
- **use_date** — best before / use-by date
- **expiration_date** — expiration date (must not be consumed after)
- **removal_date** — removal date
- **alert_date** — alert date for activities

Quants link to lots via `stock.quant.lot_id`. So to get use-by in the sync you’d join quant → lot and read those date fields (and possibly aggregate per product/warehouse if you have multiple lots).

**To list all columns** for any inventory model (to see exactly what your Odoo version exposes):

```bash
python list_inventory_fields.py --pretty
# Or one model:
python list_inventory_fields.py stock.lot --pretty
```

This uses Odoo’s `fields_get` and prints every field name, type, and label for `stock.quant`, `stock.lot`, `product.product`, and `stock.warehouse` (or the model(s) you pass).
