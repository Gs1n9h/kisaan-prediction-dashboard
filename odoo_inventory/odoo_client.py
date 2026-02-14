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
