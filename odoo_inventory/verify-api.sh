#!/usr/bin/env bash
# Check that the Sync API is running and returns valid data.
# Usage: cd /path/to/odoo_inventory && bash verify-api.sh
# Or:    bash verify-api.sh [base_url]   e.g.  bash verify-api.sh http://192.168.1.10:8765

set -e
ODIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
BASE="${1:-http://127.0.0.1:8765}"

# Optional: load key from .env for /sync test
if [[ -f "$ODIR/.env" ]]; then
  SYNC_API_KEY="$(grep '^SYNC_API_KEY=' "$ODIR/.env" 2>/dev/null | cut -d= -f2-)" || true
fi
CURL_EXTRA=()
if [[ -n "$SYNC_API_KEY" ]]; then
  CURL_EXTRA=(-H "X-Sync-Key: $SYNC_API_KEY")
fi

echo "=== Checking Odoo Sync API at $BASE ==="
echo ""

# 1) Health
echo -n "[1] GET $BASE/health ... "
resp="$(curl -s -w "\n%{http_code}" "${CURL_EXTRA[@]}" "$BASE/health")"
code="$(echo "$resp" | tail -n1)"
body="$(echo "$resp" | sed '$d')"
if [[ "$code" != "200" ]]; then
  echo "FAIL (HTTP $code)"
  echo "$body" | head -5
  exit 1
fi
if ! echo "$body" | grep -qE '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "FAIL (bad body)"
  echo "$body"
  exit 1
fi
echo "OK"

# 2) Sync (actual Odoo call)
echo -n "[2] GET $BASE/sync ... "
resp="$(curl -s -w "\n%{http_code}" "${CURL_EXTRA[@]}" "$BASE/sync")"
code="$(echo "$resp" | tail -n1)"
body="$(echo "$resp" | sed '$d')"
if [[ "$code" != "200" ]]; then
  echo "FAIL (HTTP $code)"
  echo "$body" | head -10
  exit 1
fi
if ! echo "$body" | grep -q '"warehouses"'; then
  echo "FAIL (response missing warehouses)"
  echo "$body" | head -5
  exit 1
fi
echo "OK"

# Summary
echo ""
echo "API is running and returning Odoo data. Use SYNC_API_URL and SYNC_API_KEY in n8n (see N8N_INSTRUCTIONS.md)."
