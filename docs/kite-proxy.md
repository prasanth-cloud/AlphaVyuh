# Kite Order Proxy

Kite Connect requires a registered IP for order placement. Railway's outbound IPs
are dynamic, so order requests (`/orders/*`) are routed through a Fly.io proxy
with a stable IPv4 address.

## Architecture

```
Backend (Railway)  ──/orders/*──▶  Fly.io tinyproxy (bom)  ──▶  api.kite.trade
                   ──/user/*───────────────────────────────────▶  api.kite.trade
                   ──/portfolio/*──────────────────────────────▶  api.kite.trade
```

Only order paths go through the proxy. Read-only paths (profile, holdings,
positions, quotes, instruments) connect directly to reduce latency.

## Setup

### 1. Deploy the proxy

```bash
cd infra/kite-proxy
fly launch --name alphavyuh-kite-proxy --region bom --no-deploy
fly deploy
fly ips list   # note the dedicated IPv4
```

### 2. Register IP in Kite app settings

Go to https://developers.kite.trade → App settings → Allowed IPs.
Add the IPv4 from `fly ips list`.

### 3. Configure backend env vars (Railway)

```
KITE_PROXY_URL=http://alphavyuh-kite-proxy.fly.dev:8888
KITE_PROXY_IP=<the IPv4 from step 2>
```

### 4. Verify

```bash
# Hit the smoke endpoint
curl https://alphavyuh-production.up.railway.app/api/brokers/kite/proxy-ip-check

# Or run the test
cd backend && .venv/bin/python -m pytest tests/test_kite_proxy.py -v
```

## Proxy config

- **Image:** Alpine + tinyproxy
- **Filter:** Only `api.kite.trade` and `kite.zerodha.com` are allowed
- **Region:** `bom` (Mumbai) for lowest latency to NSE
- **Resources:** shared-cpu-1x, 256MB — handles order volume comfortably
- **Always-on:** `min_machines_running = 1`, `auto_stop_machines = false`

## Env vars

| Var | Where | Purpose |
|-----|-------|---------|
| `KITE_PROXY_URL` | Railway | `http://alphavyuh-kite-proxy.fly.dev:8888` |
| `KITE_PROXY_IP` | Railway | Expected outbound IPv4 for smoke test verification |

## Troubleshooting

- **Orders fail with NetworkException:** Check `fly status` and `fly logs` for the proxy app.
- **IP mismatch in smoke test:** Run `fly ips list` and compare with `KITE_PROXY_IP`.
  If Fly reassigned the IP, update both Kite app settings and the env var.
- **Non-order calls slow:** They should not go through the proxy. Check that
  `_needs_proxy()` in `kite/api.py` returns `False` for the affected path.
