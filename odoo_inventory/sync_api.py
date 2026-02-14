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
        # Quiet; log to stderr so systemd captures it
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
