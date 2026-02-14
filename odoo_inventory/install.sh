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
  if ! python3 -m venv "$ODIR/.venv" 2>/dev/null; then
    echo ""
    echo "Virtual environment failed (often: python3-venv not installed)."
    PYVER="$(python3 -c 'import sys; print(sys.version_info.major, sys.version_info.minor)' 2>/dev/null | tr ' ' '.')"
    if [[ -n "$PYVER" ]] && command -v apt-get &>/dev/null; then
      echo "On Debian/Ubuntu, run:"
      echo "  sudo apt update && sudo apt install -y python3-venv"
      echo "  # or for a specific Python: sudo apt install -y python${PYVER}-venv"
    else
      echo "Install python3-venv (e.g. sudo apt install python3-venv) then run this script again."
    fi
    echo ""
    echo "Then remove the failed venv and re-run: rm -rf $ODIR/.venv && bash install.sh"
    exit 1
  fi
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

# Prompt for Odoo if not set (optional: we can just warn)
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

# Resolve URL: host IP that Docker/n8n can use (same machine) or first non-loopback
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
echo "  localhost inside the container = the container itself."
echo "=============================================="
echo ""
echo "Verify: bash verify-api.sh"
echo "Full n8n instructions: see N8N_INSTRUCTIONS.md"
