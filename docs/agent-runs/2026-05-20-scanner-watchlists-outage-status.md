# Scanner Watchlists Outage Status

Date: 2026-05-20
Branch: `codex/scanner-watchlists-outage-status`

## Scope

Scanner add-to-watchlist actions depended on the watchlist list request. When that request failed, the scanner page cleared the available list and silently hid add-to-watchlist options, leaving traders without an explanation or retry path.

## Changes

- Added explicit scanner page state for watchlist selector failures.
- Clear stale watchlist choices on failure and show a compact sidebar warning: `Watchlists unavailable`.
- Preserve scanner row actions for shortlisting, chart review, journal review, ignore/review-later, and data reporting while watchlist choices are unavailable.
- Added a retry control that reloads watchlists without leaving the scanner.
- Extended the scanner unavailable Playwright spec to force live API calls under mock auth and assert the watchlist outage is visible while row actions remain usable.

## Verification

- `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm exec -- playwright test --config=playwright.config.ts tests/e2e/scanner-unavailable.spec.ts`
- `npm run typecheck`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run test:e2e:mock`
- Browser check on `http://localhost:3010/scanner` with live API disabled confirmed visible `Watchlists unavailable` and retry text on the scanner page.

## Recovery Note

This change hardens the scanner/watchlist workflow but does not complete production data recovery. The latest recovery check still needs Railway backend hosting credentials/auth restored before the production API can be verified.
