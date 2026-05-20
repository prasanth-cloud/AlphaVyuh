# 2026-05-20 - Chart drawing persistence outage status

## Scope
- Changed live chart drawing save, update, and delete helpers to throw backend error details instead of generic failures or silent deletes.
- Updated the chart page to surface drawing persistence failures in the toolbar message area.
- Kept local chart drawing edits visible when persistence fails, but no longer leaves traders with the impression that the drawing was safely saved.

## Validation
- `npm --prefix frontend run test -- --run tests/unit/mock-chart-persistence.test.ts`
- `npm run typecheck`
- `npm run test:production-api-check`
- `npm run test:production-smoke-env-check`
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off`
- `npm run test:e2e:mock`

## Recovery status
- This does not unblock Railway hosting recovery by itself.
- Data recovery remains blocked on production API availability and missing/expired Railway recovery credentials.
