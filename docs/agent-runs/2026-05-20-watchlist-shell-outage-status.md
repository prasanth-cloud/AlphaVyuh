# 2026-05-20 - Watchlist shell outage status

Goal: prevent watchlist shell outages from rendering as successful empty watchlist states.

Changes:
- Changed `/api/v1/watchlists` admin/client and shell-query failures to return HTTP 503 with `Watchlist shell is temporarily unavailable.`
- Preserved the valid empty-watchlist state when the shell query succeeds and returns no rows.
- Added backend coverage for admin outage, shell-query outage, and valid empty shell behavior.
- Added frontend coverage proving watchlist HTTP 503 details surface to users, alongside the existing legacy `mode: "unavailable"` guard.

Validation:
- `pytest backend/tests/test_watchlist_outage_status.py backend/tests/test_journal_context.py backend/tests/test_broker_order_safety.py` passed: 17 tests.
- `npm test -- tests/unit/watchlists-api.test.ts tests/unit/data-errors.test.ts` passed: 2 files, 5 tests.
- `npm run typecheck` passed.
- `npm run test:production-api-check` passed.
- `npm run test:production-smoke-env-check` passed.
- `npm run test:e2e:mock` passed: 12 tests.

Production recovery:
- This hardens watchlist trust states but does not complete production recovery. Railway/backend recovery still requires `npm run check:data-recovery` to pass against production.
