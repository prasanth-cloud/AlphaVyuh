# 2026-05-20 - Community screens outage status

## Scope
- Hardened `/api/v1/community/screens` so shared-screen store failures return HTTP 503 with `Community screens are temporarily unavailable.`
- Returned shared screens in a `{ screens }` envelope while keeping successful empty results valid.
- Updated `getSharedScreens()` to reject service errors, unavailable payloads, and malformed payloads instead of returning `[]`.
- Kept client compatibility with the legacy array payload so existing deployments do not false-empty during rollout.

## Validation
- `pytest backend/tests/test_community_outage_status.py`
- `npm --prefix frontend run test -- --run tests/unit/community-api.test.ts tests/unit/mock-launch-fallbacks.test.ts`
- `npm run typecheck`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run test:e2e:mock`

## Recovery status
- This does not unblock Railway hosting recovery by itself.
- Data recovery remains blocked on production API availability and missing/expired Railway recovery credentials.
