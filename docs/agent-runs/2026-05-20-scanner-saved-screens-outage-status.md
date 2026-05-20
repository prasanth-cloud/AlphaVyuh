# 2026-05-20 - Scanner saved screens outage status

## Scope
- Hardened `/api/v1/scanner/screens` so saved-screen store failures return HTTP 503 with `Saved scanner screens are temporarily unavailable.`
- Kept a successful empty saved-screen query as a valid empty list.
- Changed `getScreens()` to reject service errors, unavailable payloads, and malformed payloads instead of returning `[]`.
- Updated the scanner page to show a compact `My screens unavailable` state with retry when saved screens cannot load.

## Validation
- `pytest backend/tests/test_scanner_outage_status.py`
- `npm --prefix frontend run test -- --run tests/unit/scanner-api.test.ts`
- `npm run typecheck`
- Browser verification on `http://localhost:3004/scanner` with a local API returning 503 for `/api/v1/scanner/screens`; confirmed `My screens unavailable`, the outage message, and one retry button render.
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run test:e2e:mock`

## Recovery status
- This does not unblock Railway hosting recovery by itself.
- Data recovery remains blocked on production API availability and missing/expired Railway recovery credentials.
