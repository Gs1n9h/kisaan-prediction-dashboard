#!/usr/bin/env bash
# One-time setup: install and enable the Odoo sync API as a systemd service.
# Run on the VPS (as root or with sudo). Survives reboot; no maintenance.
#
# Usage:
#   cd /path/to/odoo_inventory
#   sudo bash install-sync-api-service.sh
#
# Or:
#   sudo bash install-sync-api-service.sh /path/to/odoo_inventory

set -e
ODOO_INVENTORY_DIR="${1:-$(pwd)}"
ODOO_INVENTORY_DIR="$(cd "$ODOO_INVENTORY_DIR" && pwd)"

if [[ ! -f "$ODOO_INVENTORY_DIR/sync_api.py" ]]; then
  echo "Error: sync_api.py not found in $ODOO_INVENTORY_DIR"
  exit 1
fi
if [[ ! -x "$ODOO_INVENTORY_DIR/.venv/bin/python" ]]; then
  echo "Error: .venv not found. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

SERVICE_NAME="odoo-sync-api"
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
UNIT_CONTENT="[Unit]
Description=Odoo inventory sync API (for n8n)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ODOO_INVENTORY_DIR
ExecStart=$ODOO_INVENTORY_DIR/.venv/bin/python sync_api.py
Restart=always
RestartSec=5
EnvironmentFile=-$ODOO_INVENTORY_DIR/.env

[Install]
WantedBy=multi-user.target
"

echo "Installing $SERVICE_NAME to $UNIT_PATH (dir=$ODOO_INVENTORY_DIR)"
echo "$UNIT_CONTENT" | sudo tee "$UNIT_PATH" > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager || true
echo ""
echo "Done. API will start on boot. Check: systemctl status $SERVICE_NAME"
echo "Default URL: http://$(hostname -I | awk '{print $1}'):8765/sync (or set SYNC_API_PORT in .env)"
echo "Optional: set SYNC_API_KEY in .env and pass X-Sync-Key in n8n HTTP Request."
