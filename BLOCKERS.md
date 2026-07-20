# AlphaVyuh Blockers Ledger

Use this file when an agent cannot safely continue without owner input, credentials, production access, or a business decision.

## Current Owner-Gated Areas

- Production Supabase actions: require explicit owner approval and evidence after application.
- Broker validation: requires owner-provided Kite/Upstox tokens for read-only smoke; any sandbox/live order path requires explicit order-level confirmation.
- Billing: production Razorpay or paid checkout remains owner-approved only.
- Market data rights: paid/live vendor choice and redistribution terms require owner decision.
- Legal/support copy: final public copy, disclaimers, and support commitments require owner approval.
- Production launch posture: Professional Access is the current posture; broader
  paid/public launch timing remains an owner decision.

## 2026-06-18 - Production recovery needs authenticated verification

- Owner: Product/deploy owner with production QA access.
- Blocking: A complete signed-in production declaration for dashboard, scanner,
  watchlist, chart, and journal.
- Current evidence: `npm run check:data-recovery` passes the production API
  smoke with the 2026-06-18 market summary, breadth, and five-year daily chart
  history. A safe invalid-credential request to
  `https://www.alphavyuh.com/api/auth/login` now returns the expected 401
  `Invalid login credentials`, not the prior `exceed_db_size_quota` restriction.
- Remaining evidence gap: This environment does not have
  `PRODUCTION_API_BEARER_TOKEN`, `PLAYWRIGHT_QA_EMAIL`, or
  `PLAYWRIGHT_QA_PASSWORD`, so authenticated scanner/watchlist API checks and a
  signed-in production browser smoke were not run. Production also still serves
  the older landing and login copy; the trader-cockpit branch has not been
  published or deployed.
- Safe next step after input: Provide short-lived QA credentials/token and rerun
  `npm run check:data-recovery` plus the signed-in production smoke. Do not run
  broker orders; broker validation remains read-only unless separately approved.

## 2026-07-18 - Vercel deployment is paused and the account is blocked

- Owner: Vercel account/deployment owner.
- Blocking: The public AlphaVyuh frontend, public/auth-boundary release checks,
  preview deployments for open product PRs, and signed-in production QA.
- Why it matters: `https://www.alphavyuh.com/` and the inspected public routes
  return HTTP 402 with Vercel's "This deployment is temporarily paused" page.
  All 8 release-readiness cases fail at the public edge, before AlphaVyuh code
  can render. Open PR Vercel checks report "Account is blocked."
- Required decision or input: Restore/unpause the Vercel account or deployment.
  This requires owner access and cannot be repaired safely in application code.
- Safe work completed: The Railway production API remains reachable; the
  2026-07-17 completed-session summary and representative five-year chart
  histories pass. Public data recovery passes, while authenticated and raw
  Supabase checks remain skipped without owner credentials/project links.
- Safe next step after input: Confirm `/` no longer returns 402, rerun
  `npm run check:public-posture`, then run the 8-test public/auth-boundary suite
  and the signed-in production smoke with short-lived QA credentials.

### 2026-07-20 evidence refresh

- The in-app browser still renders Vercel's paused-deployment page. Direct Vercel project evidence now confirms that recent preview deployments are `READY` while the project itself reports `live: false`.
- A raw unauthenticated public-domain probe is now intercepted by Cloudflare's managed challenge. Its HTTP 403 must not be reported as an AlphaVyuh application response.
- Railway remains reachable and current for the completed 2026-07-20 session, with 2,383 covered symbols and 96.7% reported coverage.
- Railway is contract-old despite current data: `npm run check:production-api:railway` fails because the response does not name the market-universe contract. PR #409's `nse_active_eq` contract still needs review, merge, and deployment.
- The safe next step is unchanged: the owner restores Vercel, applies and verifies the journal migrations staging-first, reviews the stacked PRs, and supplies short-lived QA credentials for authenticated production verification.

## Blocker Entry Template

```md
## YYYY-MM-DD - Short blocker title

- Owner:
- Blocking:
- Why it matters:
- Required decision or input:
- Safe work completed:
- Safe next step after input:
```
