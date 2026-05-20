# 2026-05-20 - Journal review outage status

## Scope

- Harden `/api/v1/journal/analytics` so journal analytics query failures return HTTP 503 instead of becoming empty analytics in the UI.
- Harden `/api/v1/ai/patterns` so trade-pattern review query failures return HTTP 503 instead of reusing the valid insufficient-trades shape.
- Update `getJournalAnalytics()` and `getAiPatterns()` to reject service errors and legacy unavailable payloads.
- Add explicit unavailable states in the Journal analytics and Trade review tabs so closed trades are not counted as empty or insufficient during service outages.
- Update Data Status AI pattern readiness to show unavailable when trade review patterns cannot be confirmed.

## Evidence

- Backend focused tests:
  - `pytest backend/tests/test_journal_analytics_outage_status.py backend/tests/test_journal_context.py`
- Frontend focused tests:
  - `npm test -- tests/unit/account-data-api.test.ts tests/unit/candles-cache.test.ts`
- Frontend typecheck:
  - `npm run typecheck`
- Journal e2e:
  - `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/journal.spec.ts`
- Production guard scripts:
  - `npm run test:production-api-check`
  - `npm run test:production-smoke-env-check`
- Dependency audit:
  - `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- Mock workflow e2e:
  - `npm run test:e2e:mock`

## Production recovery status

- This improves account-data trust while Railway backend production recovery remains blocked.
- `npm run check:data-recovery` still fails because:
  - Production API `/health` returns Railway fallback `404 Application not found`.
  - GitHub recovery secrets are missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
  - No Railway Backend Recovery workflow runs are available yet.
  - Local Railway CLI auth is expired and needs `npm run recover:railway-backend:login`.
- Passing recovery checks:
  - Vercel production env points at the recovery API URL with live data mode and mock fallback disabled.
  - Supabase EOD data is present for 2026-05-19 with 3101/3448 symbols, or 90% coverage.
  - Chart smoke config includes RELIANCE, ITC, and AUBANK.
