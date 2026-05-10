# Manual actions required for broker integration

## 1. Backend env vars

Add these to `backend/.env` for local verification and Railway production when ready:

```bash
KITE_API_KEY=<get from kite.trade>
KITE_API_SECRET=<get from kite.trade>
UPSTOX_API_KEY=<get from Upstox developer portal>
UPSTOX_API_SECRET=<get from Upstox developer portal>
UPSTOX_REDIRECT_URI=https://alphavyuh.com/broker/callback?broker=upstox
BROKER_CREDS_KEY=<generate with: openssl rand -hex 32>
BROKER_LIVE_ORDERS_ENABLED=false
```

`BROKER_LIVE_ORDERS_ENABLED` should stay `false` until a small owner-approved live-order verification window. Even when enabled, the backend requires Pro/Elite plan status and the frontend sends live orders only after explicit user confirmation.

## 2. Apply migration

Apply one of these equivalent migration files through the reviewed Supabase migration path:

- `supabase/migrations/20260510080300_broker_connections_orders.sql`
- `backend/migrations/030_broker_connections.sql`

The migration creates:

- `broker_connections` for sanitized broker connection metadata.
- `broker_orders` for order audit records.

Access tokens remain in the existing encrypted `broker_credentials` table.

## 3. Register broker apps

### Zerodha

1. Go to `https://kite.trade`.
2. Register app: `AlphaVyuh`.
3. Redirect URL: `https://alphavyuh.com/broker/callback?broker=zerodha`.
4. Add API key/secret to backend env.

### Upstox

1. Go to the Upstox developer portal.
2. Register app: `AlphaVyuh`.
3. Redirect URL: `https://alphavyuh.com/broker/callback?broker=upstox`.
4. Add API key/secret to backend env.

## 4. Platform costs

- Zerodha Kite Connect: typically a monthly platform/app cost.
- Upstox API: depends on the current developer program and rate limits.

Verify current broker pricing before committing paid infrastructure spend.
