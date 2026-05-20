# Vercel read-only data recovery

Date: 2026-05-20
Branch: `codex/vercel-readonly-data-recovery`

## Why

The live website has no market data because the production API target,
`https://alphavyuh-production.up.railway.app`, returns Railway fallback
`404 Application not found`. Supabase EOD rows are current, but Railway backend
recovery remains blocked on owner activation or missing Railway GitHub secrets.

## Change

- Added same-origin API base support with `NEXT_PUBLIC_API_URL=same-origin`.
- Added Vercel-hostable read-only recovery routes for:
  - `/health`
  - `/api/v1/health`
  - `/api/v1/data/health`
  - `/api/v1/market/summary`
  - `/api/v1/market/overview`
  - `/api/v1/charts/[symbol]/candles`
  - `/api/v1/charts/[symbol]/indicators`
  - `/api/v1/scanner/run`
  - chart layout/workspace/drawings safe defaults
  - price-alert and broker status safe read-only defaults
- The recovery routes read Supabase EOD data with server-side env and do not
  provide broker, journal, watchlist write recovery.
- Updated `npm run check:data-recovery` env validation so `same-origin` is a
  valid production frontend API target when the preflight is run against the
  frontend deployment URL.

## Local Real-Data Smoke

Started the frontend dev server with backend Supabase env and:

```bash
PLAYWRIGHT_MOCK_AUTH=true \
NEXT_PUBLIC_API_URL=same-origin \
NEXT_PUBLIC_DATA_MODE=mock \
NEXT_PUBLIC_FORCE_LIVE_DATA=true \
NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false \
npm --prefix frontend run dev -- --port 3000
```

Recovery endpoint evidence:

- `/health`: `status=ok`, `mode=vercel_readonly_recovery`, `trade_date=2026-05-20`.
- `/api/v1/data/health`: `status=healthy`, latest `2026-05-20`, `3104` symbols, mode `eod`.
- `/api/v1/charts/RELIANCE/candles?timeframe=D&limit=200`: `200` candles, `2025-08-07 -> 2026-05-20`, close `1359.7`, mode `eod`.
- `/api/v1/charts/RELIANCE/indicators?indicators=ema20,ema50,rsi&timeframe=D`: `365` points for EMA20, EMA50, and RSI.
- `/api/v1/market/overview`: `3104` rows, `1546` advances, `1486` declines, coverage `90%`, mode `eod`.
- `/api/v1/scanner/run`: latest `2026-05-20`, `1958` matches for `price_min=100`, `25` visible rows, mode `eod`.
- Local production API smoke passed with authenticated scanner check:
  `ALLOW_LOCAL_API_CHECK=1 PRODUCTION_API_URL=http://localhost:3000 PRODUCTION_API_BEARER_TOKEN=recovery-smoke npm run check:production-api`
  - Summary `2026-05-20`
  - Breadth `1546/1486`
  - RELIANCE, ITC, AUBANK each returned `500` candles through `2026-05-20`
  - Scanner returned `25/2451` matches through `2026-05-20`

Browser smoke:

- `http://localhost:3000/charts/RELIANCE?full=1` rendered RELIANCE with price
  `₹1,359.70`, chart range through `2026-05-20`, tools, and BUY/SELL actions.
- Candle, layout, drawing, and price alert outage banners were absent after
  safe read-only defaults were added.
- Open trades and review context may still show unavailable because journal and
  portfolio recovery require the full backend.

## Validation

- Passed: `npm --prefix frontend run lint`
- Passed: `npm --prefix frontend run typecheck`
- Passed: `npm run test:data-recovery-check`
- Passed: `npm --prefix frontend run test -- api-base`
- Passed: `npm --prefix frontend run test`
  - `37` files, `163` tests
- Passed: `npm run test:production-api-check`
- Passed: `npm run test:production-smoke-env-check`
- Passed: `git diff --check`
- Passed after stopping the manual dev server: `npm --prefix frontend run e2e:mock`
  - `12` tests

## Deployment Notes

To activate this on production Vercel after merge:

1. Set production `NEXT_PUBLIC_API_URL=same-origin`.
2. Add production `SUPABASE_SERVICE_ROLE_KEY` to Vercel.
3. Redeploy the frontend.
4. Run `PRODUCTION_API_URL=<production-frontend-url> PRODUCTION_API_BEARER_TOKEN=<token-or-placeholder> npm run check:production-api`.
5. Run `PRODUCTION_API_URL=<production-frontend-url> npm run check:data-recovery`.

Railway/backend recovery is still required before marking the full goal complete.
