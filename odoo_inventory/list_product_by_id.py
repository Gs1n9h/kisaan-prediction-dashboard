#!/usr/bin/env python3
"""
Read a single product by ID and output all fields from product.product.
Useful to inspect use_time, expiration_time, use_expiration_date, etc.

Usage:
  python list_product_by_id.py           # product id 959
  python list_product_by_id.py 123       # product id 123

Requires ODOO_* in .env. Output is JSON to stdout.
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


def sanitize_for_json(val):
    """Replace binary/large values with a placeholder so JSON is readable."""
    if val is None or val is False or val is True:
        return val
    if isinstance(val, bytes):
        return "<binary %d bytes>" % len(val)
    if isinstance(val, (list, tuple)):
        if len(val) == 2 and isinstance(val[0], (int, float)) and isinstance(val[1], str):
            return val  # many2one [id, name]
        return [sanitize_for_json(v) for v in val]
    if isinstance(val, dict):
        return {k: sanitize_for_json(v) for k, v in val.items()}
    if isinstance(val, str) and len(val) > 500:
        return "<string %d chars>" % len(val)
    return val


def main():
    ap = argparse.ArgumentParser(description="Read one product.product by ID with all fields")
    ap.add_argument("product_id", type=int, nargs="?", default=959, help="Product ID (default: 959)")
    args = ap.parse_args()

    _, _, execute_kw = connect()

    # read() without 'fields' returns all fields for the given ids
    rows = execute_kw("product.product", "read", [[args.product_id]])
    if not rows:
        print(json.dumps({"error": "Product not found", "id": args.product_id}, indent=2))
        return 1

    product = rows[0]
    out = sanitize_for_json(product)
    print(json.dumps(out, indent=2, default=str))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)
