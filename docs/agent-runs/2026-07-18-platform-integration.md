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
- frontend unit tests: 122 files, 563 tests passed
- frontend dependency audit: 0 known vulnerabilities
- backend tests: 478 passed, 1 skipped
- backend dependency audit: 0 known vulnerabilities
- launch, recovery, data-contract, setup-review, broker-safety, and security regression suites passed

Direct local Playwright remained disabled pending explicit owner authorization. The draft integration PR is responsible for combined CI browser evidence.

## External release gates

- Apply and verify the two journal migrations in staging and production.
- Restore the blocked Vercel account/deployment.
- Run authenticated production smoke with owner-provided QA credentials.
