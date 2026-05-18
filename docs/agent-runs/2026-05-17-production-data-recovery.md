# Production Data Recovery Agent Run

Date: 2026-05-17
Branch: `codex/fix-production-data-empty`

## Agents

- Data Agent: audited Supabase coverage, backend health, Railway status, and frontend API wiring.
- QA/Product Agent: reviewed product surfaces for empty/degraded states and professional polish gaps.
- Manager Agent: implemented the code guardrails, ran validation, and captured launch blockers.

## What Was Found

- Supabase is not empty. The production database has market universe, EOD candles, and scanner data.
- The backend code can read real Supabase data locally: `/health`, `/api/v1/market/summary`, and chart candles pass against the local backend.
- Production data is missing because the Railway backend service has no active deployment. Railway refused redeploy with: trial expired.
- The frontend also had fragile `NEXT_PUBLIC_API_URL` handling. Quoted values, whitespace, or literal newline escapes could break API requests.

## What Was Changed

- Added a shared API URL normalizer so frontend API callers strip quotes, whitespace, literal newline escapes, and trailing slashes.
- Moved dashboard, scanner, auth, options, and shared API code onto the normalized API base.
- Added `npm run check:production-api`, which verifies:
  - `/health`
  - `/api/v1/market/summary`
  - `/api/v1/charts/RELIANCE/candles?timeframe=D&limit=3`
- Added that production data smoke to the launch-readiness script when an API URL is provided.
- Improved dashboard/scanner outage copy so users see a professional data-service message with Retry and Data Status instead of raw 404/errors.

## Validation

- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm --prefix frontend run test -- --run`: pass, 67 tests
- `backend/.venv/bin/python -m pytest backend/tests/test_charts.py backend/tests/test_scanner_filters.py backend/tests/test_market_overview_failsoft.py backend/tests/test_public_market_rate_limits.py`: pass, 56 tests
- `npm audit --audit-level=moderate`: pass, 0 vulnerabilities
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`: pass
- `npm run test:e2e:mock`: pass, 10 tests
- `npm run test:e2e:layout`: pass, 15 tests
- `npm run test:e2e:perf`: pass, 2 tests
- Local real-data smoke: `ALLOW_LOCAL_API_CHECK=1 NEXT_PUBLIC_API_URL=http://127.0.0.1:8011 npm run check:production-api`: pass
- Production backend smoke: fails because Railway deployment is inactive/trial expired.

## Human/Owner Blocker

Production real data cannot be restored until the backend is hosted again.

Pick one:

1. Reactivate Railway billing and redeploy the existing backend service.
2. Move the FastAPI backend to another always-on host.
3. Approve a larger migration that serves read-only market data through Vercel/Supabase-backed routes.

Recommended immediate choice: reactivate Railway for the founder beta because it is the fastest recovery path and does not require architecture churn.

## Product Polish Recommendations

- Keep the app dark, compact, and workflow-first.
- Make Data Status a first-class operator page with last successful EOD, coverage, source, and active backend host.
- Add a visible “Data degraded” banner only when the backend fails, not as normal page chrome.
- Replace raw empty states with next actions: run scan, add symbol, open chart, review journal.
- Add a weekly “beta health” checklist: data freshness, scanner count, chart candle availability, login time, console errors, and top user feedback.
