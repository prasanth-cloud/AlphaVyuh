# 2026-05-20 - Sector list outage status

## Scope
- Hardened `/api/v1/market/sectors` so stock-universe store failures return HTTP 503 with `Sector list is temporarily unavailable.`
- Kept a successful but sparse universe query as a valid empty sector list when no sector has at least three active stocks.
- Changed `getSectors()` to reject service errors, unavailable payloads, and malformed payloads instead of returning `[]`.

## Validation
- `pytest backend/tests/test_market_aux_outage_status.py`
- `npm --prefix frontend run test -- --run tests/unit/market-aux-api.test.ts`
- `npm run typecheck`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run test:e2e:mock`

## Recovery status
- This does not unblock Railway hosting recovery by itself.
- Data recovery remains blocked on production API availability and missing/expired Railway recovery credentials.
