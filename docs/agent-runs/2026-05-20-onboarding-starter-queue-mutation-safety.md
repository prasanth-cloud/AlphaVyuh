# Onboarding Starter Queue Mutation Safety

## Goal

Prevent first-run onboarding from looking complete when the starter watchlist
queue cannot be created or populated by the backend.

## Changes

| Area | Change | Trader impact | Remaining dependency |
| --- | --- | --- | --- |
| Onboarding starter queue | Starter queue setup now creates the watchlist and confirms every starter-symbol add before marking onboarding complete. | A new trader is not sent into an empty or partially persisted desk after a failed setup mutation. | Live production proof still waits on Railway backend recovery. |
| Error handling | Failed starter queue setup keeps the trader on onboarding and shows backend detail such as watchlist add outages. | The setup failure is explicit and retryable instead of hidden behind a completed state. | A partially created server-side queue may still require backend cleanup/versioning later. |
| Regression coverage | Added forced-live Playwright coverage proving failed starter-symbol adds do not PATCH `onboarding_completed` and do not leave onboarding. | Future onboarding edits should not reintroduce false-success first-run setup. | In-app Browser is unavailable in this desktop session, so Playwright is the browser fallback evidence. |

## Validation

- PASS `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/onboarding-mutation-failures.spec.ts`
- PASS `npm --prefix frontend run lint`
- PASS `npm --prefix frontend run typecheck`
- PASS `git diff --check`
- PASS `npm --prefix frontend run e2e:mock`
- PASS `npm --prefix frontend run test`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- INFO Browser skill was already loaded in this session and the in-app browser was attempted, but `agent.browsers.list()` returned `[]`; the forced-live Playwright spec above is the browser fallback evidence.

## Follow-up

After Railway backend recovery, repeat onboarding starter-queue setup against
production with an authenticated QA account and verify the saved queue persists
through reload.
