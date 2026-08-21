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
- Blocking: The repository's new setup, rulebook, scanner-lineage, EOD quality, unplanned-tag, and trade-review migrations cannot be applied or RLS-tested against the intended production project.
- Why it matters: The connected Supabase account lists only unrelated projects, direct access to project `fyxltykqdvacbdgmeucf` is denied, and the production Supabase hostname is unresolved. Railway production `SUPABASE_URL` is configured to that same unresolved host. Railway health is reachable (`/healthz` HTTP 200, version 0.3.1), but `/api/v1/market/summary` returns HTTP 503. GitHub production signed-in smoke run `32405141720` failed during QA-account preparation with `getaddrinfo ENOTFOUND fyxltykqdvacbdgmeucf.supabase.co`. Railway is still serving the older main deployment `59899d8e-6c69-4c75-91f4-d26badacf2e0` (`7dc2310`), whose scheduled price-alert job also logs the Supabase DNS failure.
- Required decision or input: Reconnect the correct Supabase account/project and repair the GitHub `SUPABASE_ACCESS_TOKEN`/environment configuration. Do not create a replacement database without an explicit recovery decision.
- Safe work completed: Local implementation, tests, review, PR #412, and branch Vercel/code checks are complete; GitHub secret names for Railway recovery are present; migration drift reports local count 68 and remote `auth-error`; no production database or broker state was mutated.
- Safe next step after input: Apply migrations in staging first, verify two-user RLS and service-only operational access, then recover the production data path and rerun authenticated browser/API smokes.

### Current recheck — 2026-08-21

- Railway CLI access is authenticated to the `AlphaVyuh` production service. The service is online on deployment `59899d8e-6c69-4c75-91f4-d26badacf2e0`, but its service variable `SUPABASE_URL` still resolves to `fyxltykqdvacbdgmeucf.supabase.co`.
- Direct probes still show Railway `/health` HTTP 200 and `/api/v1/market/summary` HTTP 503. Railway logs show DNS failure while querying Supabase, so redeploying the same configuration would not restore market data.
- The authenticated Supabase dashboard exposes only the unrelated paused project `prasaanth-x-content` (`dfqsujkivkaihbczlrrt`) and the separate Commuto/MenuDash organization; the documented AlphaVyuh project `fyxltykqdvacbdgmeucf` remains inaccessible. The paused project was not resumed or substituted.
- The repository recovery preflight reproduces the same 503 and confirms that the Railway recovery secrets exist. No secret values were printed or changed.

## 2026-06-18 - Production recovery needs authenticated verification

> Historical evidence only. This entry is superseded by the 2026-08-20 AlphaVyuh Supabase project blocker above; current verification found the Railway market-summary path returning HTTP 503 and the intended Supabase project unavailable.

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
