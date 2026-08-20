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

## 2026-08-20 - AlphaVyuh Supabase project unavailable

- Owner: Product/deploy owner with access to the AlphaVyuh Supabase organization.
- Blocking: The repository's new setup, rulebook, scanner-lineage, and EOD quality migrations cannot be applied or RLS-tested against the intended production project.
- Why it matters: The connected Supabase account lists only unrelated projects, direct access to project `fyxltykqdvacbdgmeucf` is denied, and the production Supabase hostname is unresolved. Railway health is reachable, but `/api/v1/market/summary` returns HTTP 503 and authenticated production smoke cannot prepare its QA account.
- Required decision or input: Reconnect the correct Supabase account/project and repair the GitHub `SUPABASE_ACCESS_TOKEN`/environment configuration. Do not create a replacement database without an explicit recovery decision.
- Safe work completed: Local implementation, tests, review, PR #412, and branch CI/Vercel status are complete; no production database or broker state was mutated.
- Safe next step after input: Apply migrations in staging first, verify two-user RLS and service-only operational access, then recover the production data path and rerun authenticated browser/API smokes.

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
