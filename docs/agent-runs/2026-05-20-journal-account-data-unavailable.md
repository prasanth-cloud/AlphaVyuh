# 2026-05-20 - Journal account data unavailable states

## Summary

- Updated the journal page to treat journal entries, journal stats, and broker status failures as unavailable account data instead of silently rendering empty or manual states.
- Added a journal account-data warning with retry, a table-level unavailable row, and broker status unavailable copy that hides broker import until status can be confirmed.
- Extended the journal route-intercept tests to cover entry, stats, and broker outage states. The helper now intercepts nested journal routes such as `/journal/stats`.

## Verification

- `npm run typecheck` from `frontend` passed.
- `npm test -- tests/unit/account-data-api.test.ts tests/unit/watchlists-api.test.ts` from `frontend` passed: 2 files, 5 tests.
- `NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=true NEXT_PUBLIC_FORCE_LIVE_DATA=true PLAYWRIGHT_MOCK_AUTH=true PLAYWRIGHT_BASE_URL=http://localhost:3000 npm exec -- playwright test --config=playwright.config.ts tests/e2e/journal.spec.ts --grep "account data unavailable"` from `frontend` passed: 3 tests.
- `npm run e2e:mock` from `frontend` passed: 12 tests.
- Browser smoke on `http://localhost:3002/journal` with mock auth/data showed populated journal rows, broker import ready state, and no account-data warning in the healthy path.
- `npm run check:data-recovery` from repo root still fails as expected because Railway production API returns 404 `Application not found`, GitHub Railway recovery secrets are missing, no Railway recovery workflow runs exist, and local Railway CLI auth needs `railway login`.

## Remaining blocker

Production recovery is still owner-gated on Railway backend reattachment/deployment plus Railway GitHub secrets or local Railway login.
