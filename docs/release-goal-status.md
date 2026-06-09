# Release goal status — 2026-06-09

GOAL_ACHIEVED=false

Staging reactivation is blocked by the Supabase free-tier active-project limit. All other release gates passed on 2026-06-09.

## Checklist

| # | Goal | Status | Evidence |
|---|------|--------|----------|
| 1 | Prod signed-in smoke | **PASS** | [Production Signed-In Smoke run 27207003032](https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27207003032) — 1/1 Playwright test passed (20.1s). QA account prepared via `scripts/prepare-production-smoke-account.mjs` (GitHub secrets + unique email per run). |
| 2 | Staging reactivate + migration | **BLOCKED** | `alphavyuh-staging` (`nltfedbnbbrclcufoaly`) is `INACTIVE`. Supabase MCP `restore_project` failed: org `prasanth-cloud` at 2-project free limit (`AlphaVyuh` + `chatembed` active). Migration `20260606120000_journal_broker_import_source.sql` not applied. |
| 3 | Prod deploy parity (Railway ≥ `7b60c6a` M3-A) | **PASS** | [Railway Backend Recovery run 27207144284](https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27207144284) deployed `eccc80c` (includes `7b60c6a`). Health: `curl https://alphavyuh-production.up.railway.app/health` → `{"status":"ok","version":"0.3.1"}`. Scanner smoke: 25/1000 matches, 60.9% query reduction, **2 db prefilters** (M3-A active). |
| 4 | CI Main Verify green on latest main | **PASS** | [Main Verify run 27093275777](https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27093275777) on `eccc80c` — success. |
| 5 | Mock e2e 17/17 | **PASS** | Local `npm run test:e2e:mock` — 17 passed (23.0s). |

## Signed-in smoke evidence

- **Workflow:** Production Signed-In Smoke (manual dispatch)
- **Run:** https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27207003032
- **Frontend:** https://www.alphavyuh.com
- **API:** https://alphavyuh-production.up.railway.app
- **Result:** Preflight PASS (EOD 2026-06-08, 3130/3463 symbols, authenticated scanner). Browser smoke 1 passed.
- **Note:** Local login with `pbugga@student.fitchburgstate.edu` fails (invalid credentials). CI uses GitHub `PLAYWRIGHT_QA_EMAIL` + per-run unique email via `prepare-production-smoke-account.mjs`.

## Staging blocker — owner action required

Supabase free tier allows 2 active projects. Current active: `AlphaVyuh` (prod) + `chatembed`.

**Option A — pause unused project, then restore staging:**

1. Supabase Dashboard → `chatembed` → Project Settings → **Pause project** (if not needed).
2. Supabase Dashboard → `alphavyuh-staging` → **Restore project** (or rerun MCP `restore_project` with id `nltfedbnbbrclcufoaly`).
3. Wait until status is `ACTIVE_HEALTHY`.
4. Apply migration:
   ```bash
   bash scripts/deploy-migration.sh staging
   ```
5. Verify constraint:
   ```sql
   SELECT pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname = 'trade_journal_source_page_check';
   ```
   Must include `broker-import`.

**Option B — upgrade Supabase org** to allow 3+ active projects, then restore staging.

## Production notes

- **Prod migration:** `journal_broker_import_source` applied on prod as `20260606144647_journal_broker_import_source`.
- **Supplemental refresh:** WARN — RS score / yfinance supplement degraded on latest run; inspect Daily NSE refresh before trusting RS-ranked scanner output.
- **Previous Railway deploy:** `ccc7eb6` (2026-06-01) was 16 commits behind main; redeployed 2026-06-09.

## Next action

1. Owner: pause `chatembed` or upgrade Supabase → restore `alphavyuh-staging`.
2. Agent/owner: `bash scripts/deploy-migration.sh staging` after staging is active.
3. Re-run this checklist; set `GOAL_ACHIEVED=true` when staging migration is verified.
