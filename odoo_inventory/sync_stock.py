#!/usr/bin/env python3
"""
Fetch current stock by warehouse from Odoo (dynamic — loops over all warehouses).
READ-ONLY. Includes all active stockable products (quantity=0 when no stock).

Outputs JSON to stdout (for n8n: run without --output so the next node can parse it):
  {
    "warehouses": [{"id", "name", "code"}, ...],
    "stock_by_warehouse": [{"warehouse_id", "odoo_product_id", "category_name", "category_path", ...}, ...],
    "category_roots": ["Raw Material", ...],
    "summary": {"warehouse_count", "total_lines"}
  }
  category_path: ["Raw Material", "Card Boxes", "Dividers"] for drill-down filters.

Run:
  python sync_stock.py                    # print JSON to stdout (use from n8n)
  python sync_stock.py --output file.json # write to file
  python sync_stock.py --warehouse 1      # limit to one warehouse

Loads ODOO_* from .env if present. All non-JSON messages go to stderr.
"""
import argparse
import json
import sys
from collections import defaultdict

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from odoo_client import connect


def fetch_stock_from_odoo(execute_kw, warehouse_id=None):
    """
    Fetch warehouses and stock from Odoo. Returns (warehouses, stock_list, category_roots).
    warehouse_id: optional single warehouse id to limit to.
    """
    wh_domain = [["active", "=", True]]
    if warehouse_id is not None:
        wh_domain.append(["id", "=", warehouse_id])
    warehouses = execute_kw(
        "stock.warehouse",
        "search_read",
        [wh_domain],
        {"fields": ["id", "name", "code", "lot_stock_id"], "order": "name"},
    )
    if not warehouses:
        return [], []

    # 1. Fetch all active products (no stockable filter; includes services, consumables, etc.)
    prod_domain = [["active", "=", True]]
    prod_read = execute_kw(
        "product.product",
        "search_read",
        [prod_domain],
        {"fields": ["id", "default_code", "name", "categ_id", "active"], "order": "default_code"},
    )

    # 2a. Fetch full category path (parent/child) from product.category
    categ_ids = []
    for p in prod_read:
        categ = p.get("categ_id")
        if categ and isinstance(categ, (list, tuple)) and len(categ) >= 1:
            categ_ids.append(categ[0])
    categ_ids = list(set(categ_ids))
    def _parse_category_path(complete_name):
        """Split 'Raw Material / Card Boxes / Dividers' into ['Raw Material', 'Card Boxes', 'Dividers']."""
        if not complete_name or not isinstance(complete_name, str):
            return []
        return [s.strip() for s in complete_name.split("/") if s.strip()]

    categ_paths = {}
    categ_path_arrays = {}
    if categ_ids:
        try:
            categ_read = execute_kw(
                "product.category",
                "read",
                [categ_ids],
                {"fields": ["id", "complete_name"]},
            )
            for c in categ_read:
                raw = (c.get("complete_name") or "").strip()
                categ_paths[c["id"]] = raw
                categ_path_arrays[c["id"]] = _parse_category_path(raw)
        except Exception:
            categ_read = execute_kw(
                "product.category",
                "read",
                [categ_ids],
                {"fields": ["id", "name"]},
            )
            for c in categ_read:
                raw = (c.get("name") or "").strip()
                categ_paths[c["id"]] = raw
                categ_path_arrays[c["id"]] = [raw] if raw else []

    products = {}
    for p in prod_read:
        categ = p.get("categ_id")
        categ_id = categ[0] if categ and isinstance(categ, (list, tuple)) and len(categ) >= 1 else None
        category_name = categ_paths.get(categ_id, "") if categ_id else ""
        category_path = categ_path_arrays.get(categ_id, []) if categ_id else []
        products[p["id"]] = {
            "default_code": p.get("default_code") or "",
            "name": (p.get("name") or "")[:80],
            "category_name": category_name,
            "category_path": category_path,
            "active": p.get("active", True),
        }

    # 2. Fetch stock quants per warehouse (quantities; 0 means product not in quant)
    stock_by_wh = defaultdict(lambda: defaultdict(lambda: {"quantity": 0, "reserved_quantity": 0}))
    for w in warehouses:
        lot_stock = w.get("lot_stock_id")
        loc_id = lot_stock[0] if isinstance(lot_stock, (list, tuple)) and len(lot_stock) >= 1 else lot_stock
        if not loc_id:
            continue
        wh_name = w["name"]
        batch = execute_kw(
            "stock.quant",
            "search_read",
            [[("location_id", "child_of", loc_id), ("quantity", "!=", 0)]],
            {"fields": ["product_id", "quantity", "reserved_quantity"], "order": "product_id"},
        )
        for q in batch:
            prod_id = q["product_id"][0] if isinstance(q["product_id"], (list, tuple)) else q["product_id"]
            stock_by_wh[wh_name][prod_id]["quantity"] += q.get("quantity") or 0
            stock_by_wh[wh_name][prod_id]["reserved_quantity"] += q.get("reserved_quantity") or 0

    # 3. Build stock_list: all products x all warehouses (quantity 0 when no stock)
    category_roots = set()
    stock_list = []
    for prod_id, info in products.items():
        if info.get("active") is False:
            continue
        path = info.get("category_path", [])
        if path:
            category_roots.add(path[0])
        for w in warehouses:
            wh_name = w["name"]
            vals = stock_by_wh[wh_name].get(prod_id, {"quantity": 0, "reserved_quantity": 0})
            qty = vals["quantity"]
            res = vals["reserved_quantity"]
            stock_list.append({
                "warehouse_name": wh_name,
                "warehouse_id": w["id"],
                "odoo_product_id": prod_id,
                "product_name": info.get("name", ""),
                "default_code": info.get("default_code", ""),
                "category_name": info.get("category_name", ""),
                "category_path": info.get("category_path", []),
                "active": info.get("active", True),
                "quantity": qty,
                "reserved_quantity": res,
                "available_quantity": qty - res,
            })
    return warehouses, stock_list, category_roots


def main():
    ap = argparse.ArgumentParser(description="Sync stock by warehouse from Odoo")
    ap.add_argument("--output", "-o", help="Write JSON to file (default: stdout)")
    ap.add_argument("--warehouse", type=int, help="Only this warehouse ID (default: all)")
    args = ap.parse_args()

    cfg, uid, execute_kw = connect()
    warehouses, stock_list, category_roots = fetch_stock_from_odoo(execute_kw, args.warehouse)

    result = {
        "warehouses": [{"id": w["id"], "name": w["name"], "code": w.get("code") or ""} for w in warehouses],
        "stock_by_warehouse": stock_list,
        "category_roots": sorted(category_roots),
        "summary": {
            "warehouse_count": len(warehouses),
            "total_lines": len(stock_list),
        },
    }
    _write_output(result, args.output)
    return 0


def _write_output(obj, path):
    s = json.dumps(obj, indent=2)
    if path:
        with open(path, "w") as f:
            f.write(s)
        print(f"Wrote {path}", file=sys.stderr)
    else:
        print(s)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)
