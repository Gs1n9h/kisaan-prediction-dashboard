#!/usr/bin/env python3
"""
List all warehouses from Odoo (dynamic — no hardcoded IDs). Read-only.
Run locally: python list_warehouses.py
Loads ODOO_* from .env if present.
"""
import json
import os
import sys

# Load .env when running locally (n8n can inject env instead)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from odoo_client import connect


def main():
    cfg, uid, execute_kw = connect()

    # Dynamic: fetch all active warehouses (and inactive if you want)
    warehouses = execute_kw(
        "stock.warehouse",
        "search_read",
        [[]],
        {"fields": ["id", "name", "code", "active"], "order": "name"},
    )

    # Normalize for JSON (Odoo returns many2one as [id, name])
    out = []
    for w in warehouses:
        out.append({
            "id": w.get("id"),
            "name": w.get("name"),
            "code": w.get("code"),
            "active": w.get("active", True),
        })

    print(json.dumps({"warehouses": out, "count": len(out)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)
