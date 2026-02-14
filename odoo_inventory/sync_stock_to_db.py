#!/usr/bin/env python3
"""
Sync Odoo inventory to Supabase (analytics.odoo_warehouses, analytics.odoo_inventory_snapshot).
Run via cron every 6h or via n8n webhook. Requires ODOO_* and SUPABASE_URL, SUPABASE_SERVICE_KEY.
READ-ONLY for Odoo; writes only to our DB.
"""
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
    # Also load dashboard .env so we can use VITE_SUPABASE_* from the same project
    _dashboard_env = os.path.join(os.path.dirname(__file__), "..", "kisaan_prediction_dashboard", ".env")
    if os.path.isfile(_dashboard_env):
        load_dotenv(_dashboard_env)
except ImportError:
    pass

from supabase import create_client

from odoo_client import connect
from sync_stock import fetch_stock_from_odoo


def main():
    # Prefer SUPABASE_*, fall back to VITE_SUPABASE_* (dashboard .env)
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("VITE_SUPABASE_SERVICE_KEY")
    if not url:
        print("Set SUPABASE_URL or VITE_SUPABASE_URL", file=sys.stderr)
        return 1
    if not key:
        print(
            "Set SUPABASE_SERVICE_KEY or VITE_SUPABASE_SERVICE_KEY (service role key required for sync; anon key cannot write)",
            file=sys.stderr,
        )
        return 1

    cfg, uid, execute_kw = connect()
    warehouses, stock_list = fetch_stock_from_odoo(execute_kw, None)

    client = create_client(url, key)

    # Upsert warehouses (by id); updated_at uses DB default
    wh_rows = [{"id": w["id"], "name": w["name"], "code": w.get("code") or ""} for w in warehouses]
    if wh_rows:
        client.schema("analytics").from_("odoo_warehouses").upsert(wh_rows, on_conflict="id").execute()

    # Upsert inventory snapshot (by odoo_product_id, warehouse_id). Need warehouse_id on each row.
    if not stock_list:
        return 0

    snapshot_rows = []
    for row in stock_list:
        wid = row.get("warehouse_id")
        if wid is None:
            continue
        snapshot_rows.append({
            "odoo_product_id": row["odoo_product_id"],
            "warehouse_id": wid,
            "warehouse_name": row["warehouse_name"],
            "product_name": row.get("product_name") or "",
            "default_code": row.get("default_code") or "",
            "category_name": row.get("category_name") or "",
            "quantity": float(row.get("quantity") or 0),
            "reserved_quantity": float(row.get("reserved_quantity") or 0),
            "available_quantity": float(row.get("available_quantity") or 0),
        })
    # snapshot_at uses DB default NOW()
    client.schema("analytics").from_("odoo_inventory_snapshot").upsert(
        snapshot_rows,
        on_conflict="odoo_product_id,warehouse_id",
    ).execute()

    print(f"Synced {len(warehouses)} warehouses, {len(snapshot_rows)} inventory rows", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
