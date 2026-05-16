# AlphaVyuh Release Readiness

Use this checklist before every customer-facing release.

## Release Stages

1. Mock demo
   - Frontend: `NEXT_PUBLIC_DATA_MODE=mock`
   - Backend: `MARKET_DATA_PROVIDER=mock`
   - Purpose: stable customer demos, screenshots, onboarding, marketing review.
   - App badge should show `Demo data`.

2. Live internal beta
   - Frontend: `NEXT_PUBLIC_FORCE_LIVE_DATA=true`
   - Backend: official/free EOD bhavcopy as primary store; `MARKET_DATA_PROVIDER=kite` only for user-connected broker quote/order workflows.
   - Purpose: internal validation with reliable EOD scanner/chart data and broker flows.
   - App badge should show `EOD data`, `delayed`, or `live beta` only when that exact provider mode is configured and approved.

3. Licensed production data
   - Frontend: `NEXT_PUBLIC_FORCE_LIVE_DATA=true`
   - Backend: `MARKET_DATA_PROVIDER=truedata` or `globaldatafeeds`
   - Purpose: platform-wide live data after vendor credentials and legal approval.

## Required Checks

Run these before release:

```bash
npm run launch:check
# To skip local browser server smoke in constrained shells only:
# SKIP_BROWSER_SMOKE=1 npm run launch:check
# To include read-only Kite/Upstox account smoke when tokens are available:
# RUN_BROKER_SMOKE=1 npm run launch:check
# To validate one broker at a time:
# RUN_BROKER_SMOKE=1 BROKER_SMOKE_TARGET=kite npm run launch:check
# RUN_BROKER_SMOKE=1 BROKER_SMOKE_TARGET=upstox npm run launch:check

cd frontend
npm run lint
npm run test
npm run build
NEXT_PUBLIC_DATA_MODE=mock npm run build
npx playwright test tests/e2e/release-readiness.spec.ts
npm run test:e2e:release
npx playwright test --config=playwright.mock.config.ts tests/e2e/performance-smoke.spec.ts
npx playwright test --config=playwright.mock.config.ts tests/e2e/layout-smoke.spec.ts
npx playwright test --config=playwright.backend.config.ts
npm audit --audit-level=moderate

cd ../backend
.venv/bin/pytest
.venv/bin/pip-audit -r requirements.txt
MARKET_DATA_PROVIDER=mock .venv/bin/python -c "from app.services.market_data import get_market_data_provider; print(get_market_data_provider().name)"
```

The release owner should also complete `docs/customer-launch-runbook.md` before any paid customer release.

Read-only broker account smoke, when real credentials are available:

```bash
npm run broker:smoke
BROKER_SMOKE_TARGET=kite npm run broker:smoke
BROKER_SMOKE_TARGET=upstox npm run broker:smoke
BROKER_SMOKE_TARGET=kite npm run broker:smoke -- --login-url
BROKER_SMOKE_TARGET=upstox npm run broker:smoke -- --login-url
BROKER_SMOKE_TARGET=kite npm run broker:smoke -- --request-token <request_token>
BROKER_SMOKE_TARGET=upstox npm run broker:smoke -- --code <authorization_code>
```

These broker scripts verify account/data reads only. Do not run live order placement
as a release gate unless the account owner explicitly confirms the exact broker,
symbol, side, quantity, order type, and sandbox/live mode.

## Security Checklist

- Supabase service-role key is never exposed to frontend env or browser bundles.
- Supabase RLS policies are enabled for user-owned tables.
- Broker credentials are encrypted at rest.
- Razorpay webhooks validate signatures.
- Auth redirects reject external `next` URLs.
- Protected app routes redirect logged-out users.
- API endpoints with user data require JWT auth.
- Expensive endpoints have rate limits.
- Sentry client/server DSNs are set for production.
- Production has `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.
- Dependency audit has no unresolved high/critical issues.

## Current Audit Notes

- 2026-05-07 public launch readiness pass: see `docs/public-launch-readiness-2026-05-07.md` and `docs/security-launch-scan-2026-05-07.md`.
- Frontend uses Next.js 16.2.4 at the time of the 2026-05-07 pass. Treat any future Next.js audit as current-version evidence, not the older Next 14 migration note.
- Backend: the legacy `kiteconnect` package was removed from production requirements. Kite routes use the internal HTTP wrapper in `app.brokers.kite.api`, avoiding the old `autobahn==19.11.2` dependency path.

## Data Checklist

- Mock mode works without Supabase market rows or live vendor credentials.
- Official/free EOD bhavcopy ingest populates `daily_ohlcv` for scanners, watchlists, daily charts, alerts, and RS/indicator columns.
- `ENABLE_YFINANCE_REFRESH=false` in production unless explicitly validating fallback data.
- Yahoo fallback works for local validation only.
- Kite mode is used only for connected broker users.
- TrueData/GlobalDatafeeds mode is used only after data redistribution terms are approved.
- Chart candles, quotes, scanner, watchlists, journal, alerts, and portfolio have visible non-empty states.

## UX Checklist

- Landing page loads at `/`.
- Landing and dashboard logo marks match.
- Top navigation shows the correct data-mode badge.
- Login/signup/reset-password are accessible.
- Dashboard, scanner, watchlist, charts, journal, alerts, settings are visually aligned.
- Mobile landing page has no clipped buttons or overlapping text.
- Error boundary shows a clean recovery screen.

## Marketing Gate

Do not start paid marketing until:

- Mock demo flow is screenshot/video ready.
- Production env vars are reviewed.
- Legal/data vendor decision is recorded.
- Payment test flow is verified.
- At least one internal user completes signup, onboarding, scanner, chart, watchlist, journal, and logout.
