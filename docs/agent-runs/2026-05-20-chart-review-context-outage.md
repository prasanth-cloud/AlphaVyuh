# Chart review context outage

Date: 2026-05-20
Branch: `codex/chart-review-context-outage`

## Change

- Added explicit full-chart review context outage state for journal entry load failures.
- The chart no longer reports `No history` when the symbol journal review request fails.
- The compact review card, sidebar review header, context pills, and expanded review panel now show that review context is unavailable while candles, drawings, alerts, and order planning remain usable.
- Added Playwright coverage for a journal outage with healthy chart candles and indicators.

## Validation

- Passed: `PLAYWRIGHT_MOCK_AUTH=true NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_FORCE_LIVE_DATA=true NEXT_PUBLIC_ALLOW_MOCK_FALLBACK=false npm --prefix frontend exec -- playwright test --config=frontend/playwright.config.ts frontend/tests/e2e/chart-unavailable.spec.ts`
  - `4 passed`
- Passed: `npm --prefix frontend run lint`
- Passed: `npm --prefix frontend run typecheck`
- Passed: `git diff --check`
- Passed: `npm --prefix frontend run test`
  - `37 passed`, `161 passed`
- Passed: `npm run test:production-api-check`
- Passed: `npm run test:production-smoke-env-check`
- Passed: `npm --prefix frontend run e2e:mock`
  - `12 passed`
- Browser smoke: `http://localhost:3000/charts/AUBANK?full=1` rendered the chart shell with `AUBANK`, `Review context`, `Tools`, `BUY`, and `SELL` visible. Browser screenshot capture timed out; DOM smoke and Playwright coverage passed.

## Production Data Recovery

`npm run check:data-recovery` still fails because the production API URL is not serving the backend:

- Production API `https://alphavyuh-production.up.railway.app/health` returns Railway fallback `404 Application not found`.
- Vercel production env passes and points at the recovery API URL.
- Supabase EOD data passes: latest `daily_ohlcv` date is `2026-05-20` with `3104/3449` symbols, `90%` coverage.
- GitHub recovery secrets are still missing: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE`.
- No Railway Backend Recovery workflow runs were found.
- Local Railway CLI auth is expired and returns `invalid_grant`.

Attempted `npm run recover:railway-backend:login`. Railway printed activation code `WBXN-TXVC` for `https://railway.com/activate`, then waited for owner authentication. Activation was not completed during this run, so the command was stopped with Ctrl+C to avoid leaving a recovery process running. A fresh recovery attempt needs a new code.

Recovery remains blocked until the owner completes Railway CLI activation or adds the Railway GitHub secrets and runs the manual Railway Backend Recovery workflow.
