# Using the Sync API in n8n

## 1. What is the API URL?

After `install.sh`, the API runs on the **host** at port **8765** (or `SYNC_API_PORT` in `.env`):

- **Same machine (no domain):**  
  `http://<host-ip>:8765/sync`  
  The installer prints this URL using your server’s IP (e.g. `http://192.168.1.10:8765/sync`).

- **With a domain (optional):**  
  If you put a reverse proxy (e.g. Caddy, Nginx) in front and use DNS, you’d use something like `https://sync.yourdomain.com/sync`. **You do not need a domain** for the API to work; it’s only for a nicer URL and HTTPS.

---

## 2. Will it work with n8n in Docker?

**Yes.** n8n in Docker must call the **host** where the Sync API runs, not `localhost` (inside the container `localhost` is the container itself).

- **Sync API and n8n on the same server:**  
  Use the URL the installer printed (host IP + port), e.g. `http://192.168.1.10:8765/sync`. No DNS needed.
- **Alternative (Docker Desktop or Linux with `extra_hosts`):**  
  Use `http://host.docker.internal:8765/sync` so the container can reach the host.

---

## 3. Do I need DNS?

**No.** DNS is only needed if you want a hostname (e.g. `sync.yourdomain.com`) instead of an IP.

- Same machine: use the printed **host IP** URL; no DNS.
- n8n on another server: use the **VPS/public IP** (e.g. `http://203.0.113.50:8765/sync`) and open port 8765 in the firewall; no DNS.
- Optional: point a domain to the server and put the API behind a reverse proxy (HTTPS, nicer URL).

---

## 4. Get the credentials

After running `bash install.sh` in this folder, the script prints something like:

```
SYNC_API_URL=http://192.168.1.10:8765/sync
SYNC_API_KEY=sync-abc123...
```

Use these as n8n environment variables (see below). If you use a **domain** (e.g. `sync.yourdomain.com`) instead of an IP, set `SYNC_API_URL=https://sync.yourdomain.com/sync` (and serve the API behind HTTPS).

---

## 5. Localhost vs domain: when n8n runs in Docker

- **n8n on the same machine (e.g. in Docker)**  
  From inside the n8n container, **`localhost` is the container itself**, not your host. So **do not** set `SYNC_API_URL=http://localhost:8765/sync` if the Sync API runs on the host.

  Use one of:

  - **Host IP** – The installer prints a URL with your host’s IP (e.g. `http://192.168.1.10:8765/sync`). Use that. n8n (in Docker) can reach the host at that IP.
  - **`host.docker.internal`** – On Docker Desktop (Mac/Windows), `http://host.docker.internal:8765/sync` points to the host. On Linux you may need to add to your n8n stack:
    ```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ```
    Then use `SYNC_API_URL=http://host.docker.internal:8765/sync`.

- **n8n on another server or in the cloud**  
  Use the **public URL** of the Sync API (domain or VPS IP), e.g. `https://sync.yourdomain.com/sync` or `http://YOUR_VPS_IP:8765/sync`. Ensure the Sync API port (8765) is reachable (firewall, reverse proxy if using HTTPS).

- **n8n and Sync API on the same host, n8n not in Docker**  
  `http://localhost:8765/sync` is fine.

---

## 6. Set Sync API URL and key in the workflow (hardcoded in n8n UI)

We do **not** use n8n environment variables for the Sync API. Set them directly in the workflow: open the **"1. Get data from Sync API"** node, replace **URL** with your Sync API URL (e.g. from install.sh), and replace **X-Sync-Key** with your key. Save. No n8n .env needed for Sync API.

**Supabase:** set SUPABASE_URL and SUPABASE_SERVICE_KEY in n8n environment, or hardcode in the Insert nodes if you prefer.

---

## 6b. (Legacy) Set variables in n8n env

Add these to the environment where n8n runs (e.g. Docker env, or n8n’s **Settings → Variables**):

| Variable          | Example                          | Required |
|-------------------|-----------------------------------|----------|
| `SYNC_API_URL`    | `http://192.168.1.10:8765/sync`   | Yes      |
| `SYNC_API_KEY`    | (value printed by install.sh)      | Yes (install.sh adds it to .env) |
| `SUPABASE_URL`    | `https://xxx.supabase.co`         | Yes      |
| `SUPABASE_SERVICE_KEY` | (service role key)          | Yes      |

The installer generates `SYNC_API_KEY` and adds it to `.env` if missing; use the same value in n8n so the workflow’s `X-Sync-Key` header is accepted. If you remove the key from `.env`, the API allows unauthenticated requests and you can leave `SYNC_API_KEY` unset in n8n.

---

## 7. Import the workflow and activate

1. In n8n: **Workflows → Add workflow → Import from File** (or paste JSON).
2. Open **`n8n_workflows/odoo_inventory_sync.json`** from this repo and import it.
3. Ensure the variables above are set in n8n’s environment.
4. **Activate** the workflow (toggle on).
5. The **Schedule** trigger runs every 6 hours. The **Webhook** trigger is used by the dashboard “Sync from Odoo” button (set `VITE_N8N_SYNC_INVENTORY_WEBHOOK` in the dashboard to the webhook URL).

The first node (**“1. Get data from Sync API”**) does a GET to `{{ $env.SYNC_API_URL }}` with header `X-Sync-Key: {{ $env.SYNC_API_KEY }}`. No other changes are needed if the URL and key are set correctly.
