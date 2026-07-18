# Market universe contract reconciliation

Date: 2026-07-18

## Outcome

AlphaVyuh now uses one named market-universe contract across the Railway API, Vercel read-only recovery, data-health responses, breadth snapshots, latest-session selection, and production smoke checks.

The contract is `nse_active_eq`:

- market: `NSE`
- series: `EQ`
- eligibility: active symbols only
- session basis: latest complete EOD session
- numerator: distinct eligible symbols with a valid EOD row
- denominator: active eligible symbols in `stock_universe`
- complete-session floor: 75% coverage
- healthy-coverage threshold: 90%

This removes the previous definition drift where Vercel recovery could count a broader universe than the Railway market summary.

## Implementation

- Added shared frontend and backend contract helpers that return explicit universe evidence with every relevant health or summary response.
- Filtered Vercel recovery counts, rows, and session selection to active NSE EQ symbols.
- Made recovery session selection skip a newer partial ingest instead of treating the raw maximum trade date as complete.
- Filtered the backend direct market-summary fallback to the same universe.
- Reused the contract thresholds in backend market-date and breadth-health logic.
- Strengthened production API checks so a deployment fails verification when the universe contract is missing or internally inconsistent.

## Verification

`SKIP_BROWSER_SMOKE=1 STEP_TIMEOUT_SECONDS=600 npm run launch:check` passed:

- launch and recovery checker regression tests passed
- frontend lint: 0 errors, 7 pre-existing warnings
- frontend typecheck and production build passed
- frontend unit tests: 115 files, 535 tests passed
- frontend dependency audit: 0 known vulnerabilities
- backend tests: 414 passed, 1 skipped
- backend dependency audit: 0 known vulnerabilities

Focused contract verification also passed:

- frontend universe/recovery guards: 8 tests
- production API checker regression suite
- backend universe, summary, context, dates, and breadth tests: 21 tests

Local browser smoke was intentionally skipped because direct Playwright use requires explicit owner approval. CI and production browser proof remain separate deployment gates.

## Remaining external blocker

This change makes Railway and Vercel use the same definition when deployed. Public proof still depends on restoring the paused Vercel account and deploying the stacked PR chain.
