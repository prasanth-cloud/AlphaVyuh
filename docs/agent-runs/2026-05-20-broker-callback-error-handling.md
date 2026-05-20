# Broker Callback Error Handling

## Objective

Make broker OAuth callbacks safer and clearer when the broker returns an
authorization error or an unexpected broker identifier before any code/token
exchange is attempted.

## Changes

| Area | What changed | Why it matters | Residual risk |
| --- | --- | --- | --- |
| Broker callback parsing | Added explicit supported-broker parsing for Zerodha and Upstox, with unsupported broker callbacks rejected client-side. | A malformed callback URL can no longer silently fall through to the Zerodha exchange path. | Real broker callback URLs still need to be rechecked after Railway recovery. |
| Broker denial handling | Added client-side handling for broker `error` and `error_description` query params. | User-denied or broker-denied authorization now shows a clear retry message and does not attempt an exchange. | Broker-specific error copy may vary; the UI keeps the broker-provided detail short. |
| Regression coverage | Added a dedicated mock Playwright spec for denial and unsupported broker callbacks. | Future callback edits should not reintroduce code exchange on failed authorization. | The in-app Browser backend is unavailable in this desktop session, so Playwright is the browser fallback evidence. |

## Validation

- PASS `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/broker-callback.spec.ts`
- PASS `npm --prefix frontend run typecheck`
- PASS `npm run test:production-api-check`
- PASS `npm run test:production-smoke-env-check`
- PASS `git diff --check`
- PASS `npm --prefix frontend run e2e:mock`
- INFO In-app Browser verification was attempted after reading the Browser skill, but `iab` was unavailable and `agent.browsers.list()` returned `[]`; Playwright mock coverage is the browser fallback evidence.

## Follow-up

After Railway backend recovery, run live Zerodha and Upstox callback smoke checks
against production URLs and verify the broker-denial copy with real provider
redirect payloads.
