#!/usr/bin/env python3
"""
Optional: list products from Odoo (for building product_id mapping to Kisaan).
The primary source of products is inventory (sync_stock.py) — no separate product
list is required. Use this script only if you need a full catalog for mapping.
Outputs id, default_code, name.
Run: python list_products.py [--stockable]
Loads ODOO_* from .env if present. Read-only.
"""
import argparse
import json
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from odoo_client import connect


def main():
    ap = argparse.ArgumentParser(description="List Odoo products for mapping")
    ap.add_argument("--stockable", action="store_true", help="Only stockable products")
    ap.add_argument("--limit", type=int, default=500, help="Max records (default 500)")
    args = ap.parse_args()

    cfg, uid, execute_kw = connect()

    domain = []
    if args.stockable:
        # product.product: type 'product' = stockable
        domain = [["type", "=", "product"]]

    products = execute_kw(
        "product.product",
        "search_read",
        [domain],
        {
            "fields": ["id", "default_code", "name", "type", "uom_id"],
            "limit": args.limit,
            "order": "default_code",
        },
    )

    out = []
    for p in products:
        uom = p.get("uom_id")
        out.append({
            "id": p.get("id"),
            "default_code": p.get("default_code") or "",
            "name": (p.get("name") or "")[:80],
            "type": p.get("type"),
            "uom": uom[1] if isinstance(uom, (list, tuple)) and len(uom) > 1 else str(uom),
        })

    print(json.dumps({"products": out, "count": len(out)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)
