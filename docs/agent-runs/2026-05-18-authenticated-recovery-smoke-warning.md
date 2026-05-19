# Authenticated Recovery Smoke Warning

Date: 2026-05-18

## Goal

Make the production data recovery preflight honest about what has and has not
been verified. Public market endpoints can prove the backend is serving EOD
data, but scanner and watchlist workflow confidence needs an authenticated
smoke token.

## Agent Reports

| Agent | What changed | Why it improves the product | What was learned | Remaining risk |
| --- | --- | --- | --- | --- |
| QA/Data Trust Agent | Added an `Authenticated app smoke` result to `npm run check:data-recovery`. | Launch operators will not mistake public API recovery for full dashboard, scanner, watchlist, and chart verification. | The existing production API check already verifies scanner data when `PRODUCTION_API_BEARER_TOKEN` is supplied, but the recovery preflight did not make missing auth coverage visible. | Railway is still down until local `railway login` is refreshed or GitHub Railway secrets are added. |
| Release Agent | Added tests for healthy public recovery with and without an authenticated smoke token. | The verifier now preserves a green public-data recovery path while clearly warning when authenticated app paths remain unverified. | Recovery evidence needs two levels: public market API health and authenticated workflow smoke. | A real short-lived production smoke token is still required after Railway recovery to verify scanner/watchlist paths. |

## Validation

- `npm run test:data-recovery-check`
- `npm run test:production-api-check`
- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `npm audit --audit-level=moderate`
- `npm run check:data-recovery` still fails as expected because Railway returns the fallback `Application not found` response.

