# 2026-05-20 - Dashboard market unavailable guard

Goal: prevent dashboard market overview outages from being cached or rendered as a healthy zero-market snapshot.

Changes:
- Updated the market overview client to reject HTTP 200 payloads with `mode: "unavailable"` or `status: "unavailable"` before normalizing and caching.
- Added the same unavailable-payload guard to the legacy market summary fallback path.
- Added unit coverage proving unavailable overview payloads are not cached and unavailable legacy summary payloads reject.
- Added dashboard e2e coverage proving an unavailable overview payload shows outage copy and does not render the dashboard data-trust market pulse.

Validation:
- `npm test -- tests/unit/market-overview-api.test.ts tests/unit/data-errors.test.ts` from `frontend` passed: 2 files, 4 tests.
- `npm run typecheck` from `frontend` passed.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm exec -- playwright test --config=playwright.config.ts tests/e2e/dashboard-unavailable.spec.ts` from `frontend` passed: 1 test.
- `npm run e2e:mock` from `frontend` passed: 12 tests.

Production recovery:
- This improves dashboard trust states but does not complete production recovery. Railway/backend recovery still requires `npm run check:data-recovery` to pass against production.
