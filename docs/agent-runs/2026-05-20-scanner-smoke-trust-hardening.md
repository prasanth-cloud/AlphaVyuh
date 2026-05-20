# Scanner And Smoke Trust Hardening

Date: 2026-05-20
Branch: `codex/scanner-smoke-trust-hardening`

## Context

Production public data recovery is serving real EOD data through the Vercel same-origin recovery API, but full backend recovery remains blocked on Railway owner credentials and missing GitHub secrets. While that owner-gated path is pending, this run tightened two reliability gaps in the trading workflow:

- The scanner UI offered an "All results" page-size option even though the scan request is capped at 200 matches.
- The signed-in production smoke could create a QA watchlist or add a symbol while verifying real production data.

## Changes

- Removed the scanner's misleading `All results` page-size option.
- Kept scanner pagination to explicit page sizes: 25, 50, 150, and 200.
- Labeled the largest scanner page size as `200 / page (scan cap)` so traders are not led to believe every match is loaded at once.
- Made `PLAYWRIGHT_EXPECT_REAL_DATA=true` signed-in smoke read-only by failing with a clear setup error when the QA account lacks a seeded watchlist or seeded watchlist symbols.
- Preserved mock/local smoke behavior that can create a QA watchlist and add the smoke symbol.

## Validation

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run test -- scanner-api`
- `npm --prefix frontend run e2e:smoke`

## Remaining Recovery Blockers

- Railway CLI authentication is still invalid locally.
- GitHub secrets still lack `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and `RAILWAY_SERVICE`.
- No Railway Backend Recovery workflow run has completed.
- Production signed-in browser smoke still needs real `PLAYWRIGHT_QA_EMAIL` and `PLAYWRIGHT_QA_PASSWORD` credentials and a seeded read-only QA watchlist.
