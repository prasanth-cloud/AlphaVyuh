# 2026-05-20 - Scanner outage status

Goal: prevent scanner infrastructure or data outages from rendering as successful zero-result scans.

Changes:
- Changed scanner admin/client failures to return HTTP 503 with `Scanner data is temporarily unavailable.`
- Changed missing complete trade-date failures to return HTTP 503 with `No complete trade date is available for scanner.`
- Changed primary-and-fallback scanner query failures to return HTTP 503 with `Scanner query could not complete; try a narrower preset.`
- Added backend coverage for all three scanner outage paths.
- Added frontend coverage proving scanner HTTP 503 details surface to users, alongside the existing legacy `mode: "unavailable"` guard.

Validation:
- `pytest backend/tests/test_scanner_outage_status.py backend/tests/test_scanner_filters.py backend/tests/test_scan_alerts.py` passed: 52 tests.
- `npm test -- tests/unit/scanner-api.test.ts tests/unit/data-errors.test.ts` passed: 2 files, 4 tests.
- `npm run typecheck` passed.
- `npm run test:production-api-check` passed.
- `npm run test:production-smoke-env-check` passed.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/scanner-unavailable.spec.ts` passed: 1 test.
- `npm run test:e2e:mock` passed: 12 tests.

Production recovery:
- This hardens scanner trust states but does not complete production recovery. Railway/backend recovery still requires `npm run check:data-recovery` to pass against production.
