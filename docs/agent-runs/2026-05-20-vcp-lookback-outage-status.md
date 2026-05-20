# 2026-05-20 - VCP lookback outage status

## Scope
- Hardened scanner VCP pass 2 so any `get_vcp_lookback` chunk failure aborts the VCP scan with HTTP 503.
- Replaced silent partial VCP candidate dropping with `VCP scanner lookback is temporarily unavailable.`
- Preserved the valid empty-candidate path so VCP pass 2 still returns `[]` when there are no pass-1 candidates.

## Validation
- `pytest backend/tests/test_scanner_outage_status.py backend/tests/test_scanner_filters.py::TestVCPAsyncPass2`
- `npm run typecheck`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run test:e2e:mock`

## Recovery status
- This does not unblock Railway hosting recovery by itself.
- Data recovery remains blocked on production API availability and missing/expired Railway recovery credentials.
