# AlphaVyuh Private Founder Beta Launch Checklist

Date: 2026-05-07
Branch: `launch/private-founder-beta`

## Launch Posture

- Launch mode: private/founder beta, not full public launch.
- Data policy: EOD/free-first. Demo fixtures and fallback data must be visibly labeled.
- Broker posture: read-only smoke, holdings/positions/orderbook reads, filled-trade import, and journal sync only.
- Execution posture: live and sandbox broker order placement disabled.
- Billing posture: disabled or waitlist-gated. Pricing may be visible, but production Razorpay checkout stays blocked until release-candidate approval.
- Legal posture: educational workflow and journal tool, not investment advice and not a guarantee of market-data accuracy.
- Domain posture: prepare production deployment, but keep final domain switch gated until release-candidate checks pass.
- Supabase posture: migration-based, reviewed changes only; do not touch production without explicit approval.
- Paid data vendor: defer until beta feedback proves the need.

## Route Checklist

Public:

- `/` landing: private beta, EOD data, broker import only, no checkout promise.
- `/signup`: first-run path to onboarding.
- `/login`: safe `next` redirect handling.
- `/reset-password`: dark launch auth surface.
- `/privacy` and `/terms`: public pre-login legal pages.
- `/policies`: educational/disclaimer summary.
- `/contact`: support, partnerships, and security contact routes.

Authenticated:

- `/dashboard`: EOD/demo data badges and workflow next actions.
- `/scanner`: EOD source/mode/as-of/coverage metadata.
- `/watchlist`: selected symbol, chart, Decision Desk, and simulated journal capture.
- `/charts/AUBANK?full=1`: EOD/demo provenance, drawing persistence, provider/live mode disabled for beta.
- `/journal`: review queue and imported/manual/simulated source clarity.
- `/settings/broker`: read-only/import-only copy and no live-order promise.
- `/data`: EOD freshness, coverage, broker import state, no live execution promise.

## Release Candidate Gates

- Full validation passes: lint, typecheck, unit tests, dependency audits, focused backend tests, mock e2e, layout e2e, perf e2e.
- Browser QA passes desktop/tablet/mobile with no console/page errors and no horizontal overflow.
- Owner confirms support email and final legal/company copy.
- Owner confirms final domain and deployment target.
- Any production Supabase change is applied only from reviewed migrations.
- Any broker read-only smoke uses owner-provided tokens and masks all secrets.
- No sandbox/live broker order validation runs without explicit account-owner confirmation.

## Validation Evidence

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm --prefix frontend run test -- --run`: 42 passed.
- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`: no known vulnerabilities.
- `backend/.venv/bin/python -m pytest backend/tests/test_auth_middleware.py backend/tests/test_broker_order_safety.py backend/tests/test_brokers_router.py backend/tests/test_market_context.py backend/tests/test_charts.py backend/tests/test_scanner_filters.py`: 51 passed, 2 existing deprecation warnings.
- `npm run test:e2e:mock`: 9 passed.
- `npm run test:e2e:layout`: 9 passed.
- `npm run test:e2e:perf`: 2 passed.
- `PLAYWRIGHT_BASE_URL=http://localhost:3006 npm --prefix frontend exec -- playwright test --config=frontend/playwright.local.config.ts frontend/tests/e2e/auth.spec.ts`: 18 passed.

## Screenshot Evidence

- Landing desktop: `docs/screenshots/private-beta-2026-05-07/landing.png`
- Signup mobile: `docs/screenshots/private-beta-2026-05-07/signup-mobile.png`
- Pricing tablet: `docs/screenshots/private-beta-2026-05-07/pricing-tablet.png`
- Onboarding mobile: `docs/screenshots/private-beta-2026-05-07/onboarding-mobile.png`
- Dashboard desktop: `docs/screenshots/private-beta-2026-05-07/dashboard.png`
- Scanner desktop: `docs/screenshots/private-beta-2026-05-07/scanner.png`
- Watchlist desktop: `docs/screenshots/private-beta-2026-05-07/watchlist.png`
- Full chart desktop: `docs/screenshots/private-beta-2026-05-07/full-chart.png`
- Journal desktop: `docs/screenshots/private-beta-2026-05-07/journal.png`
- Broker settings tablet: `docs/screenshots/private-beta-2026-05-07/broker-settings-tablet.png`
- Data page mobile: `docs/screenshots/private-beta-2026-05-07/data-mobile.png`

## Go / No-Go Recommendation

Go for a non-paid founder/private beta when release-candidate checks pass.

No-go for paid public launch until production billing, legal approval, final domain, data vendor policy, and broker validation decisions are complete.
