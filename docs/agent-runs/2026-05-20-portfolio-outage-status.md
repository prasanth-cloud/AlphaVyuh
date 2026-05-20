# Portfolio Outage Status

Date: 2026-05-20
Branch: `codex/portfolio-outage-status`

## Scope

Closed false-empty and false-flat portfolio paths where open-position or price-store failures could look like no open positions, or compute unrealised P&L from entry-price fallbacks.

## Changes

- `GET /api/v1/journal/portfolio` now preserves valid no-open-position responses but returns `503 Portfolio is temporarily unavailable.` when open-position, EOD price, or sector breakdown reads fail.
- Portfolio live data wrappers now reject service errors, unavailable payloads, and malformed responses instead of rendering a false-empty account view.
- `/portfolio` now shows a clear unavailable state and explicitly says open positions are not being treated as empty while account data is unavailable.
- The chart open-trades panel now shows `Positions unavailable` and preserves outage state instead of replacing open positions with "No open positions in {symbol}."

## Verification

- `pytest backend/tests/test_portfolio_outage_status.py` - passed, 4 tests.
- `npm test -- tests/unit/portfolio-api.test.ts` - passed, 4 tests.
- `npm run typecheck` - passed.
- `NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_API_URL=http://localhost:8000 npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/portfolio-unavailable.spec.ts` - passed, 1 test.
- `npm run test:production-api-check` - passed.
- `npm run test:production-smoke-env-check` - passed.
- `python -m pip_audit -r backend/requirements.txt --disable-pip --no-deps --progress-spinner off` - passed.
- `npm run test:e2e:mock` - passed, 12 tests.

## Remaining Guardrails

- Full dependency audit without `--no-deps` remains blocked by transitive `pyjwt 2.12.1` / `PYSEC-2025-183`, which currently lists no fixed version. Local Supabase JWT validation uses stdlib HMAC.
- `npm run check:data-recovery` still fails because Railway production API returns fallback 404 `Application not found`, required GitHub recovery secrets are missing, no Railway Backend Recovery workflow run exists, and local Railway CLI OAuth needs re-login. Supabase EOD data, Vercel production env, and chart smoke config pass.
