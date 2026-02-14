# Setup by copy-paste (no file upload)

Use this when you can’t upload a folder and must create files by copy-pasting (e.g. SSH + nano, or a web file manager).

---

## Where to put the folder

On the **VPS/server** where the Sync API will run (same machine as n8n or one n8n can reach):

- **Suggested path:** `~/odoo_inventory` (under your login’s home), or `/opt/odoo_inventory` if you prefer.
- Create the directory and go into it:

```bash
mkdir -p ~/odoo_inventory
cd ~/odoo_inventory
```

Use this path in all steps below. If you use a different path (e.g. `/opt/odoo_inventory`), replace `~/odoo_inventory` with your path in every command.

---

## How to create each file

**Option A – Terminal (SSH)**  
For each file, run the `cat > ... << 'ENDOFFILE'` block in a terminal. Paste the **whole block** (including the line with `ENDOFFILE` at the end). That creates the file.

**Option B – Web / editor**  
Create a new file with the given path and paste the **contents** into it (do not paste the `cat`/`ENDOFFILE` lines). Save.

---

## Step 1: Create `requirements.txt`

```bash
cat > ~/odoo_inventory/requirements.txt << 'ENDOFFILE'
# Odoo inventory scripts — local testing and later n8n
python-dotenv>=1.0.0
# For sync_stock_to_db.py (Odoo → Supabase)
supabase>=2.0.0
ENDOFFILE
```

---

## Step 2: Create `.env.example`

```bash
cat > ~/odoo_inventory/.env.example << 'ENDOFFILE'
# Odoo Online — use your instance URL (e.g. https://mycompany.odoo.com)
ODOO_URL=https://your-subdomain.odoo.com
# Database name (often the subdomain, e.g. mycompany)
ODOO_DB=your-subdomain
# Login (email for Odoo Online)
ODOO_USERNAME=your-email@example.com
# API key from Preferences → Account Security → New API Key (or your password)
ODOO_PASSWORD=your-api-key-or-password

# Required for sync_stock_to_db.py (same project as dashboard)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Sync API (for n8n Option A - optional)
# SYNC_API_PORT=8765
# SYNC_API_KEY=optional-secret-for-n8n-request-header
ENDOFFILE
```

---

## Step 3: Create `odoo_client.py`

```bash
cat > ~/odoo_inventory/odoo_client.py << 'ENDOFFILE'
"""
Thin Odoo XML-RPC client for local scripts and future n8n use.
READ-ONLY: we never create, write, or unlink in Odoo; only read operations.
Uses stdlib xmlrpc.client; auth via login + password (password can be API key).
"""
import os
import xmlrpc.client
from urllib.parse import urljoin


def get_config():
    """Load config from environment (or .env via python-dotenv)."""
    url = os.environ.get("ODOO_URL", "").rstrip("/")
    db = os.environ.get("ODOO_DB", "")
    username = os.environ.get("ODOO_USERNAME", "")
    password = os.environ.get("ODOO_PASSWORD", "")
    if not all([url, db, username, password]):
        raise ValueError(
            "Set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD (or use .env)"
        )
    return {"url": url, "db": db, "username": username, "password": password}


def connect():
    """
    Authenticate with Odoo and return a client that can call execute_kw.
    Returns (config, uid, object_proxy) so you can do:
      object_proxy.execute_kw(db, uid, password, 'stock.warehouse', 'search_read', ...)
    """
    cfg = get_config()
    url = cfg["url"]
    db = cfg["db"]
    username = cfg["username"]
    password = cfg["password"]

    common = xmlrpc.client.ServerProxy(
        urljoin(url + "/", "xmlrpc/2/common"), allow_none=True
    )
    uid = common.authenticate(db, username, password, {})
    if not uid:
        raise PermissionError("Odoo authentication failed (check URL, db, user, password/api key)")

    object_proxy = xmlrpc.client.ServerProxy(
        urljoin(url + "/", "xmlrpc/2/object"), allow_none=True
    )

    # Read-only: only allow methods that do not modify Odoo data
    _READ_ONLY_METHODS = frozenset(
        {"read", "search_read", "search", "search_count", "read_group", "fields_get"}
    )

    def execute_kw(model, method, args, kwargs=None):
        if method not in _READ_ONLY_METHODS:
            raise PermissionError(
                f"Read-only client: '{method}' not allowed. Use only: {sorted(_READ_ONLY_METHODS)}"
            )
        return object_proxy.execute_kw(db, uid, password, model, method, args, kwargs or {})

    return cfg, uid, execute_kw
ENDOFFILE
```

---

## Step 4: Create `sync_stock.py`

```bash
cat > ~/odoo_inventory/sync_stock.py << 'ENDOFFILE'
#!/usr/bin/env python3
"""
Fetch current stock by warehouse from Odoo (dynamic — loops over all warehouses).
READ-ONLY. Product set is derived from inventory only (no separate product list).

Outputs JSON to stdout (for n8n: run without --output so the next node can parse it):
  {
    "warehouses": [{"id", "name", "code"}, ...],
    "stock_by_warehouse": [{"warehouse_id", "warehouse_name", "odoo_product_id", ...}, ...],
    "summary": {"warehouse_count", "total_lines"}
  }

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
    Fetch warehouses and stock from Odoo. Returns (warehouses, stock_list).
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

    stock_by_wh = defaultdict(lambda: defaultdict(lambda: {"quantity": 0, "reserved_quantity": 0}))
    product_ids = set()
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
            prod_name = q["product_id"][1] if isinstance(q["product_id"], (list, tuple)) and len(q["product_id"]) > 1 else ""
            product_ids.add(prod_id)
            key = (prod_id, prod_name)
            stock_by_wh[wh_name][key]["quantity"] += q.get("quantity") or 0
            stock_by_wh[wh_name][key]["reserved_quantity"] += q.get("reserved_quantity") or 0

    product_ids = list(product_ids)
    products = {}
    if product_ids:
        prod_read = execute_kw(
            "product.product",
            "read",
            [product_ids],
            {"fields": ["id", "default_code", "name", "categ_id"]},
        )
        for p in prod_read:
            categ = p.get("categ_id")
            category_name = (categ[1] if isinstance(categ, (list, tuple)) and len(categ) > 1 else "") or ""
            products[p["id"]] = {
                "default_code": p.get("default_code") or "",
                "name": (p.get("name") or "")[:80],
                "category_name": category_name,
            }

    stock_list = []
    for wh_name, prods in stock_by_wh.items():
        for (prod_id, prod_name), vals in prods.items():
            info = products.get(prod_id, {})
            qty = vals["quantity"]
            res = vals["reserved_quantity"]
            stock_list.append({
                "warehouse_name": wh_name,
                "warehouse_id": next((w["id"] for w in warehouses if w["name"] == wh_name), None),
                "odoo_product_id": prod_id,
                "product_name": prod_name or info.get("name", ""),
                "default_code": info.get("default_code", ""),
                "category_name": info.get("category_name", ""),
                "quantity": qty,
                "reserved_quantity": res,
                "available_quantity": qty - res,
            })
    return warehouses, stock_list


def main():
    ap = argparse.ArgumentParser(description="Sync stock by warehouse from Odoo")
    ap.add_argument("--output", "-o", help="Write JSON to file (default: stdout)")
    ap.add_argument("--warehouse", type=int, help="Only this warehouse ID (default: all)")
    args = ap.parse_args()

    cfg, uid, execute_kw = connect()
    warehouses, stock_list = fetch_stock_from_odoo(execute_kw, args.warehouse)

    result = {
        "warehouses": [{"id": w["id"], "name": w["name"], "code": w.get("code") or ""} for w in warehouses],
        "stock_by_warehouse": stock_list,
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
ENDOFFILE
```

---

## Step 5: Create `sync_api.py`

```bash
cat > ~/odoo_inventory/sync_api.py << 'ENDOFFILE'
#!/usr/bin/env python3
"""
Minimal HTTP API that runs sync_stock.py and returns the JSON output.
For use with n8n (Option A): n8n calls this URL instead of Execute Command.
Stdlib only; no extra dependencies. Loads .env from this directory.
"""
import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("SYNC_API_PORT", "8765"))
HOST = os.environ.get("SYNC_API_HOST", "0.0.0.0")
SYNC_API_KEY = os.environ.get("SYNC_API_KEY", "").strip()


def _check_auth(handler: BaseHTTPRequestHandler) -> bool:
    if not SYNC_API_KEY:
        return True
    key_header = handler.headers.get("X-Sync-Key", "").strip()
    qs = parse_qs(urlparse(handler.path).query)
    key_query = (qs.get("key") or [""])[0].strip()
    return key_header == SYNC_API_KEY or key_query == SYNC_API_KEY


def _run_sync() -> tuple[int, str]:
    """Run sync_stock.py; return (exit_code, stdout_or_error)."""
    python = sys.executable
    script = os.path.join(SCRIPT_DIR, "sync_stock.py")
    try:
        out = subprocess.run(
            [python, script],
            cwd=SCRIPT_DIR,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if out.returncode == 0:
            return 0, (out.stdout or "{}")
        err = (out.stderr or out.stdout or "Script failed").strip()
        return out.returncode, json.dumps({"error": err})
    except subprocess.TimeoutExpired:
        return -1, json.dumps({"error": "sync_stock.py timed out"})
    except Exception as e:
        return -1, json.dumps({"error": str(e)})


class SyncHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")
        if path == "/health":
            self._send(200, json.dumps({"status": "ok", "service": "odoo-sync-api"}))
            return
        if path not in ("", "/", "/sync"):
            self._send(404, json.dumps({"error": "Not found"}))
            return
        self._handle_sync()

    def do_POST(self):
        if urlparse(self.path).path.rstrip("/") not in ("", "/", "/sync"):
            self._send(404, json.dumps({"error": "Not found"}))
            return
        self._handle_sync()

    def _handle_sync(self):
        if not _check_auth(self):
            self._send(401, json.dumps({"error": "Unauthorized"}))
            return
        code, body = _run_sync()
        status = 200 if code == 0 else 500
        self._send(status, body)

    def _send(self, status: int, body: str):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))


def main():
    server = HTTPServer((HOST, PORT), SyncHandler)
    print("Sync API listening on %s:%s (SYNC_API_KEY=%s)" % (HOST, PORT, "set" if SYNC_API_KEY else "not set"), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
ENDOFFILE
```

---

## Step 6: Create `install.sh`

```bash
cat > ~/odoo_inventory/install.sh << 'ENDOFFILE'
#!/usr/bin/env bash
# One-shot installer: copy the odoo_inventory folder, run this script, get credentials for n8n.
# Usage: cd /path/to/odoo_inventory && bash install.sh
# Or:    bash install.sh /path/to/odoo_inventory

set -e
ODIR="${1:-$(pwd)}"
ODIR="$(cd "$ODIR" && pwd)"

if [[ ! -f "$ODIR/sync_api.py" ]]; then
  echo "Error: sync_api.py not found in $ODIR (run from odoo_inventory or pass its path)"
  exit 1
fi

echo "=== Odoo Sync API installer (dir=$ODIR) ==="
echo ""

# 1) Venv
if [[ ! -x "$ODIR/.venv/bin/python" ]]; then
  echo "[1/4] Creating venv and installing dependencies..."
  python3 -m venv "$ODIR/.venv"
  "$ODIR/.venv/bin/pip" install -q -r "$ODIR/requirements.txt"
else
  echo "[1/4] Venv already exists."
fi

# 2) .env
if [[ ! -f "$ODIR/.env" ]]; then
  cp "$ODIR/.env.example" "$ODIR/.env"
  echo "[2/4] Created .env from .env.example. You must edit .env and set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD."
  echo "      Run this script again after editing .env to install the systemd service and get n8n credentials."
  exit 0
fi

ODOO_URL="$(grep '^ODOO_URL=' "$ODIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")" || true
if [[ -z "$ODOO_URL" || "$ODOO_URL" == "https://your-subdomain.odoo.com" ]]; then
  echo "[2/4] .env found but Odoo credentials may be missing. Edit $ODIR/.env and set:"
  echo "      ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD"
  echo ""
  read -p "Continue anyway and install service? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[yY]$ ]]; then
    echo "Edit .env then run: bash install.sh"
    exit 1
  fi
else
  echo "[2/4] .env looks configured."
fi

# 3) SYNC_API_KEY: generate and add to .env if missing or empty
EXISTING_KEY="$(grep '^SYNC_API_KEY=' "$ODIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '\r' | xargs)" || true
if [[ -z "$EXISTING_KEY" ]]; then
  KEY="sync-$(openssl rand -hex 16 2>/dev/null || echo "$(date +%s)-$RANDOM")"
  echo "" >> "$ODIR/.env"
  echo "# Sync API auth (used by n8n X-Sync-Key header)" >> "$ODIR/.env"
  echo "SYNC_API_KEY=$KEY" >> "$ODIR/.env"
  echo "[3/4] Generated SYNC_API_KEY and added to .env"
  SYNC_API_KEY="$KEY"
else
  SYNC_API_KEY="$EXISTING_KEY"
  echo "[3/4] Using existing SYNC_API_KEY from .env"
fi

# 4) Systemd service
echo "[4/4] Installing systemd service (requires sudo)..."
SERVICE_NAME="odoo-sync-api"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
UNIT_CONTENT="[Unit]
Description=Odoo inventory sync API (for n8n)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ODIR
ExecStart=$ODIR/.venv/bin/python sync_api.py
Restart=always
RestartSec=5
EnvironmentFile=-$ODIR/.env

[Install]
WantedBy=multi-user.target
"
echo "$UNIT_CONTENT" | sudo tee "$UNIT_PATH" > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME" || true
sleep 1
sudo systemctl status "$SERVICE_NAME" --no-pager || true

PORT="$(grep '^SYNC_API_PORT=' "$ODIR/.env" 2>/dev/null | cut -d= -f2-)" || PORT="8765"
PORT="${PORT:-8765}"
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "$HOST_IP" ]]; then
  HOST_IP="$(hostname -f 2>/dev/null)" || HOST_IP="localhost"
fi

echo ""
echo "=============================================="
echo "  Use these in n8n (environment variables)"
echo "=============================================="
echo ""
echo "  SYNC_API_URL=http://${HOST_IP}:${PORT}/sync"
echo "  SYNC_API_KEY=${SYNC_API_KEY}"
echo ""
echo "  (Supabase: set SUPABASE_URL and SUPABASE_SERVICE_KEY as before.)"
echo ""
echo "=============================================="
echo "  If n8n runs in Docker on THIS machine:"
echo "  Use the URL above (host IP), NOT localhost."
echo "=============================================="
echo ""
echo "Verify: bash verify-api.sh"
echo "Full n8n instructions: see N8N_INSTRUCTIONS.md"
ENDOFFILE
```

---

## Step 7: Create `verify-api.sh`

```bash
cat > ~/odoo_inventory/verify-api.sh << 'ENDOFFILE'
#!/usr/bin/env bash
# Check that the Sync API is running and returns valid data.
# Usage: cd /path/to/odoo_inventory && bash verify-api.sh
# Or:    bash verify-api.sh [base_url]   e.g.  bash verify-api.sh http://192.168.1.10:8765

set -e
ODIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
BASE="${1:-http://127.0.0.1:8765}"

if [[ -f "$ODIR/.env" ]]; then
  SYNC_API_KEY="$(grep '^SYNC_API_KEY=' "$ODIR/.env" 2>/dev/null | cut -d= -f2-)" || true
fi
CURL_EXTRA=()
if [[ -n "$SYNC_API_KEY" ]]; then
  CURL_EXTRA=(-H "X-Sync-Key: $SYNC_API_KEY")
fi

echo "=== Checking Odoo Sync API at $BASE ==="
echo ""

echo -n "[1] GET $BASE/health ... "
resp="$(curl -s -w "\n%{http_code}" "${CURL_EXTRA[@]}" "$BASE/health")"
code="$(echo "$resp" | tail -n1)"
body="$(echo "$resp" | sed '$d')"
if [[ "$code" != "200" ]]; then
  echo "FAIL (HTTP $code)"
  echo "$body" | head -5
  exit 1
fi
if ! echo "$body" | grep -q '"status":"ok"'; then
  echo "FAIL (bad body)"
  echo "$body"
  exit 1
fi
echo "OK"

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

echo ""
echo "API is running and returning Odoo data. Use SYNC_API_URL and SYNC_API_KEY in n8n (see N8N_INSTRUCTIONS.md)."
ENDOFFILE
```

---

## Prerequisites (Debian/Ubuntu)

If the installer says the virtual environment was not created because **ensurepip is not available**, install the venv package then re-run:

```bash
sudo apt update && sudo apt install -y python3-venv
# If you use Python 3.12 specifically: sudo apt install -y python3.12-venv
rm -rf ~/odoo_inventory/.venv
bash ~/odoo_inventory/install.sh
```

---

## Step 8: Run the installer

1. Create `.env` from the example and set your Odoo credentials (you can copy `.env.example` to `.env` and edit):

```bash
cd ~/odoo_inventory
cp .env.example .env
nano .env
```

Set `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`. Save and exit (in nano: Ctrl+O, Enter, Ctrl+X).

2. Make the scripts executable and run the installer:

```bash
chmod +x install.sh verify-api.sh
bash install.sh
```

3. The script will print **SYNC_API_URL** and **SYNC_API_KEY**. Use those in n8n (see N8N_INSTRUCTIONS.md in this folder, or the main repo docs).

4. Check that the API is up:

```bash
bash ~/odoo_inventory/verify-api.sh
```

---

## If you use a different folder path

If you didn’t use `~/odoo_inventory`, replace every `~/odoo_inventory` in the commands above with your path (e.g. `/opt/odoo_inventory`). All files must be in that **same** folder so the installer and API can find them.
