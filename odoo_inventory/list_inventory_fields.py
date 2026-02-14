#!/usr/bin/env python3
"""
List all columns (fields) for Odoo inventory-related models.
Use this to discover available fields (e.g. use_date, expiration_date on stock.lot).

Usage:
  python list_inventory_fields.py              # list fields for stock.quant, stock.lot, product.product
  python list_inventory_fields.py stock.quant  # list fields for one model only

Requires ODOO_* in .env. All output is to stdout (JSON) or human-readable with --pretty.
"""
import argparse
import json
import os
import sys

try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_dotenv(_env_path)
except ImportError:
    pass

from odoo_client import connect

# Models relevant to inventory; stock.lot has use_date, expiration_date, removal_date
DEFAULT_MODELS = [
    "stock.quant",
    "stock.lot",
    "product.product",
    "stock.warehouse",
]


def main():
    ap = argparse.ArgumentParser(description="List Odoo model fields (columns) for inventory models")
    ap.add_argument(
        "models",
        nargs="*",
        default=DEFAULT_MODELS,
        help=f"Model(s) to inspect (default: {', '.join(DEFAULT_MODELS)})",
    )
    ap.add_argument("--pretty", "-p", action="store_true", help="Human-readable output")
    args = ap.parse_args()

    _, _, execute_kw = connect()
    result = {}

    for model in args.models:
        try:
            fields = execute_kw(model, "fields_get", [], {"attributes": ["string", "type"]})
            result[model] = {name: {"type": info.get("type"), "string": info.get("string", "")} for name, info in fields.items()}
        except Exception as e:
            result[model] = {"_error": str(e)}

    if args.pretty:
        for model, data in result.items():
            if "_error" in data:
                print(f"## {model}\n  Error: {data['_error']}\n")
                continue
            print(f"## {model} ({len(data)} fields)")
            for name in sorted(data.keys()):
                info = data[name]
                print(f"  {name}: {info.get('type', '?')}  ({info.get('string', '')})")
            print()
    else:
        print(json.dumps(result, indent=2))

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
