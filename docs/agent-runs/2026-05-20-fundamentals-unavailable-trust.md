# 2026-05-20 - Fundamentals unavailable trust

Goal: prevent fundamentals provider outages from rendering as empty valuation data on trading surfaces.

Changes:
- Extended the fundamentals client type with provider status/message fields.
- Treated `data_status: "unavailable"` fundamentals responses as unavailable, while keeping `data_status: "stale"` cached fundamentals available.
- Updated the full chart fundamentals accordion to show explicit unavailable copy instead of a perpetual loader or empty valuation rows.
- Added unit coverage for unavailable and stale fundamentals responses.
- Added full-chart e2e coverage proving unavailable fundamentals show outage copy and do not show a Yahoo Finance source label.

Validation:
- `npm test -- tests/unit/fundamentals-api.test.ts tests/unit/data-errors.test.ts` from `frontend` passed: 2 files, 4 tests.
- `npm run typecheck` from `frontend` passed.
- `pytest backend/tests/test_fundamentals_failsoft.py` passed: 2 tests.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm exec -- playwright test --config=playwright.config.ts tests/e2e/fundamentals-unavailable.spec.ts` from `frontend` passed: 1 test.
- `npm run e2e:mock` from `frontend` passed: 12 tests.

Production recovery:
- This improves fundamentals trust states but does not complete production recovery. Railway/backend recovery still requires `npm run check:data-recovery` to pass against production.
