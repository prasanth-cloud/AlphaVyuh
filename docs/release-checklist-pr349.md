# Release checklist — PR #349 merged + post-merge verification

**PR:** https://github.com/prasanth-cloud/AlphaVyuh/pull/349 (merged to `main`)  
**Latest verified commit:** `eccc80c` (`feat(product): clarify trader workflow memory`)  
**M3-A scanner fix:** `7b60c6a` (`fix(scanner): restore M3-A readiness gate for DB prefilters`)  
**Date:** 2026-06-09

## Verification matrix (2026-06-09)

| Step | Command / workflow | Result |
|------|---------------------|--------|
| Typecheck + lint + unit | Main Verify CI on `eccc80c` | ✓ pass |
| Mock e2e | `npm run test:e2e:mock` | ✓ 17/17 |
| Prod signed-in smoke | [Production Signed-In Smoke #27207003032](https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27207003032) | ✓ 1/1 passed |
| Prod API + scanner | Railway recovery preflight | ✓ EOD 2026-06-08, 2 db prefilters, 60.9% query reduction |
| Railway deploy parity | [Railway Backend Recovery #27207144284](https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27207144284) | ✓ deployed `eccc80c` (includes M3-A fix) |
| Health | `curl https://alphavyuh-production.up.railway.app/health` | ✓ `{"status":"ok","version":"0.3.1"}` |

## CI / production status

| Check | Status |
|-------|--------|
| Main Verify (push to `main`) | ✓ green — [run 27093275777](https://github.com/prasanth-cloud/AlphaVyuh/actions/runs/27093275777) |
| Vercel production | ✓ auto-deploy from `main` (native GitHub integration) |
| Railway backend | ✓ redeployed 2026-06-09 via recovery workflow |
| Production Signed-In Smoke | ✓ pass 2026-06-09 |

## Migration status

| Environment | Migration `journal_broker_import_source` | Status |
|-------------|------------------------------------------|--------|
| Production | Applied as `20260606144647_journal_broker_import_source` | ✓ includes `broker-import` |
| Staging | `20260606120000_journal_broker_import_source.sql` | **BLOCKED** — staging project `INACTIVE`; free-tier 2-project limit |

## Blockers (honest)

1. **Staging inactive** — Supabase org at free-tier limit (`AlphaVyuh` + `chatembed` active). Cannot restore `alphavyuh-staging` until owner pauses another project or upgrades. See `docs/release-goal-status.md` for exact steps.
2. **Supplemental refresh degraded** — RS score / yfinance supplement failed on latest run; non-blocking for smoke but affects RS-ranked scanner trust.
3. **Local QA login** — `pbugga@student.fitchburgstate.edu` invalid in prod Supabase. CI smoke uses GitHub `PLAYWRIGHT_QA_EMAIL` + `prepare-production-smoke-account.mjs`.

## Owner actions checklist

- [x] Merge PR #349 to `main`
- [x] Railway backend redeploy from latest `main`
- [x] Production signed-in smoke (GitHub workflow)
- [x] Prod migration for `broker-import` source page
- [ ] Pause `chatembed` or upgrade Supabase org
- [ ] Restore `alphavyuh-staging` (`nltfedbnbbrclcufoaly`)
- [ ] `bash scripts/deploy-migration.sh staging`
- [ ] Confirm staging constraint includes `broker-import`

## Recommended next steps

1. Free a Supabase project slot → restore staging → apply staging migration.
2. Inspect Daily NSE refresh logs for RS/yfinance supplement failures.
3. Set `GOAL_ACHIEVED=true` in `docs/release-goal-status.md` after staging migration verified.
