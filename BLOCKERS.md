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
