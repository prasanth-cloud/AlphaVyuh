# Release checklist — PR #349 (`feat/performance-trust-pass`)

**PR:** https://github.com/prasanth-cloud/AlphaVyuh/pull/349  
**Latest verified commit:** `a93b4d8` (+ local lint fix pending push)  
**Date:** 2026-06-06

## Verification matrix (local, 2026-06-06)

| Step | Command | Result |
|------|---------|--------|
| Typecheck | `cd frontend && npm run typecheck` | ✓ pass |
| Lint | `cd frontend && npm run lint` | ✓ pass (0 warnings after unused-import fix in `lib/api.ts`) |
| Unit tests | `cd frontend && npm run test` | ✓ 185/185 |
| E2E perf | `cd frontend && npm run e2e:perf` | ✓ 2/2 (`performance-smoke.spec.ts`) |
| Build | `cd frontend && npm run build` | ✓ pass |
| Backend | `cd backend && python -m pytest tests/test_scan_alerts.py tests/test_scanner_filters.py tests/test_scanner_intelligence.py tests/test_scanner_outage_status.py tests/test_brokers_router.py tests/test_broker_order_safety.py tests/test_daily_refresh_alerts.py -q` | ✓ 83/83 |

> Note: `bun` was not available in the verify environment; commands ran via `npm run` equivalents.

## CI / preview status

| Check | Status |
|-------|--------|
| Vercel Preview | ✓ green on `a93b4d8` |
| Vercel Preview Comments | ✓ pass |
| GitHub Actions (full matrix) | Not wired on this repo — Vercel-only checks |

**Vercel preview:** https://vercel.com/prasanth-clouds-projects/frontend/9oHXot4gPKVQo2BDG46Di4pv98wa

## Migration status

| Environment | Migration `20260606120000_journal_broker_import_source.sql` | Status |
|-------------|--------------------------------------------------------------|--------|
| Staging | Adds `broker-import` to `trade_journal_source_page_check` | **BLOCKED** — `.env.local` missing; Supabase MCP requires user auth |
| Production | Same | **NOT APPLIED** (by design — staging first) |

**Owner action (staging):**

```bash
# After creating .env.local with STAGING_SUPABASE_DB_URL
bash scripts/deploy-migration.sh staging
```

Verify constraint includes `broker-import`:

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'trade_journal_source_page_check';
```

## Deploy status

| Surface | Branch code live? | Notes |
|---------|-------------------|-------|
| Vercel preview | ✓ | Latest commit builds; preview SSO may block signed-in smoke |
| Vercel production | ✗ | Requires merge to `main` |
| Railway backend | ✗ | Prod tracks `main`; scanner/alerts/cron changes not live until merge |

## Blockers (honest)

1. **Signed-in browser smoke** — Vercel preview SSO blocks automated signed-in flows; prod smoke creds invalid in local env.
2. **Staging migration** — Not applied; broker import with `source_page='broker-import'` will fail CHECK constraint until migration lands on staging.
3. **PR not merged** — Production frontend and Railway backend unchanged.

## Recommended merge order

1. **Apply migration to staging** → verify `broker-import` in constraint + smoke broker import on staging.
2. **Merge PR #349 to `main`** → Vercel production deploy + Railway backend picks up Python changes.
3. **Apply migration to prod** (owner-gated, after staging verified) → `bash scripts/deploy-migration.sh prod`.
4. **Post-merge smoke** — scanner elapsed/coverage pill, watchlist batch quotes, chart skeleton, recovery banner (manual or credentialed e2e).
5. **Optional:** Run `scripts/rotate_broker_key.py` dry-run on staging before any prod credential rotation.

## Owner actions checklist

- [ ] Create `.env.local` with `STAGING_SUPABASE_DB_URL` (and prod URL when ready)
- [ ] `bash scripts/deploy-migration.sh staging`
- [ ] Confirm constraint on staging includes `broker-import`
- [ ] Review + merge PR #349
- [ ] `bash scripts/deploy-migration.sh prod` (after staging verified)
- [ ] Signed-in smoke on production with valid QA credentials
- [ ] Confirm Railway deploy from `main` includes alert-cron batching + scanner filter changes
