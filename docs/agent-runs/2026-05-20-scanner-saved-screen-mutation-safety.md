# Scanner Saved Screen Mutation Safety

## Objective

Prevent saved scanner screen save/delete failures from looking successful in the
scanner UI. A trader's saved screen should remain visible when the backend
rejects deletion.

## Changes

| Area | What changed | Why it matters | Residual risk |
| --- | --- | --- | --- |
| Scanner API client | `saveScreen()` and `deleteScreen()` now reject failed HTTP responses with backend detail. | Saved-screen mutations no longer silently succeed when the backend rejects the write. | Production persistence proof still requires Railway backend recovery. |
| Scanner UI | `/scanner` uses the shared saved-screen helpers, shows save/delete failures as toasts, and keeps a saved screen visible when delete fails. | Traders do not lose a saved screen locally when the server did not actually delete it. | Concurrent edits still need server-side versioning later. |
| Regression coverage | Added unit coverage for save/delete failures and forced-live Playwright coverage for failed saved-screen deletion. | Future edits should not reintroduce false-success saved-screen mutations. | In-app Browser is unavailable in this desktop session, so Playwright is the browser fallback evidence. |

## Validation

- PASS `npm --prefix frontend run test -- --run tests/unit/scanner-api.test.ts`
- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/scanner-unavailable.spec.ts --grep "saved screen"`
- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/scanner-unavailable.spec.ts`
- PASS `npm --prefix frontend run lint`
- PASS `npm --prefix frontend run typecheck`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `git diff --check`
- PASS `npm --prefix frontend run test`
- PASS `npm --prefix frontend run e2e:mock`
- INFO In-app Browser verification was attempted after reading the Browser skill, but `agent.browsers.list()` returned `[]`; Playwright forced-live coverage is the browser fallback evidence.

## Follow-up

After Railway backend recovery, repeat saved scanner screen save/delete checks
against production auth to prove live persistence and failure behavior on real
API responses.
