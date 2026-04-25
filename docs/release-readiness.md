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
   - Backend: `MARKET_DATA_PROVIDER=yahoo` or `kite`
   - Purpose: internal validation with real-ish market movement and broker flows.
   - App badge should show `Live data`.

3. Licensed production data
   - Frontend: `NEXT_PUBLIC_FORCE_LIVE_DATA=true`
   - Backend: `MARKET_DATA_PROVIDER=truedata` or `globaldatafeeds`
   - Purpose: platform-wide live data after vendor credentials and legal approval.

## Required Checks

Run these before release:

```bash
cd frontend
npm run lint
npm run test
npm run build
NEXT_PUBLIC_DATA_MODE=mock npm run build
npx playwright test tests/e2e/release-readiness.spec.ts
npm audit --audit-level=high

cd ../backend
.venv/bin/pytest
.venv/bin/pip-audit -r requirements.txt
MARKET_DATA_PROVIDER=mock .venv/bin/python -c "from app.services.market_data import get_market_data_provider; print(get_market_data_provider().name)"
```

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

- Frontend: `npm audit --audit-level=high` still reports Next.js 14 advisories and the related `eslint-config-next` `glob` advisory. The automated fix upgrades to Next 16, so treat this as a planned Next migration before production if self-hosting.
- Backend: the legacy `kiteconnect` package was removed from production requirements. Kite routes use the internal HTTP wrapper in `app.brokers.kite.api`, avoiding the old `autobahn==19.11.2` dependency path.

## Data Checklist

- Mock mode works without Supabase market rows or live vendor credentials.
- Yahoo fallback works for local validation.
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
