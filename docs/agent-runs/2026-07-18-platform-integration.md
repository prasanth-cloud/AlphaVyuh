# Platform integration gate

Date: 2026-07-18

## Scope

The integration branch combines the review-ready product and launch slices:

- service-role incremental guard
- deterministic launch runner and dependency remediation
- named NSE active-EQ market-universe contract
- provenance-first Market Pulse
- compact decision-oriented dashboard
- immutable journal entry context
- setup-adherence weekly review
- five-stage plan-to-outcome journal timeline

## Conflict decisions

- The dashboard keeps the compact Market State layout from the coherence slice while adding a secondary Market Pulse handoff. Scanner remains the only primary action and Data Status remains available.
- The shared API client retains both market-analytics normalization and journal snapshot/review normalization; neither boundary contract replaces the other.
- Journal and dashboard golden-path browser assertions coexist in the combined workflow test.

## Verification

`SKIP_BROWSER_SMOKE=1 STEP_TIMEOUT_SECONDS=600 npm run launch:check` passed:

- frontend lint: 0 errors, 7 pre-existing warnings
- frontend typecheck and production build passed, including `/analytics`
- frontend unit tests: 124 files, 567 tests passed after the responsive Market Pulse and contextual-feedback fixes
- frontend dependency audit: 0 known vulnerabilities
- backend tests: 478 passed, 1 skipped
- backend dependency audit: 0 known vulnerabilities
- launch, recovery, data-contract, setup-review, broker-safety, and security regression suites passed

Direct local Playwright remained disabled pending explicit owner authorization. The draft integration PR is responsible for combined CI browser evidence.

## External release gates

- Apply and verify the two journal migrations in staging and production.
- Restore the blocked Vercel account/deployment.
- Run authenticated production smoke with owner-provided QA credentials.

## Production evidence refresh

Date: 2026-07-20

- The in-app browser still renders Vercel's "This deployment is temporarily paused" page at `https://www.alphavyuh.com/`.
- The connected Vercel project lists the AlphaVyuh domains and recent `READY` preview deployments, but reports `live: false`; the latest production-target deployment remains the last merged `main` release.
- Railway is reachable at version `0.3.1` with a completed 2026-07-20 market summary: 1,241 advances, 1,028 declines, 114 unchanged, 2,383 covered symbols, 96.7% coverage, and 2,464 active-universe symbols.
- `npm run check:production-api:railway` fails because production does not yet name the market-universe contract. This proves the current Railway data is fresh while PR #409's unified `nse_active_eq` response contract remains undeployed.
- `npm run check:sector-taxonomy:railway` passes: 33 sectors, 1,000 active symbols in the audited response, 556 unmapped symbols, and explicit unverified/not-audited taxonomy labels.
- `npm run check:five-year-charts:railway` stops at the same missing market-universe contract before chart-depth checks, so current five-year production coverage is not re-proven by this refresh.
- `LIVE_URL=https://www.alphavyuh.com npm run check:public-posture` fails at `/` with HTTP 403 because the automated request reaches the managed challenge instead of AlphaVyuh code.
- A raw unauthenticated request to the public domain is intercepted by Cloudflare's managed challenge. That HTTP 403 is edge-bot behavior and is not used as evidence of AlphaVyuh application health.
