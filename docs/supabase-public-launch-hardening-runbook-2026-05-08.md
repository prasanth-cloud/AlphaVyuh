# Supabase Public Launch Hardening Runbook — 2026-05-08

This runbook exists to unblock PR #74:
<https://github.com/prasanth-cloud/AlphaVyuh/pull/74>

It applies the reviewed migration:

`supabase/migrations/20260508001000_public_launch_security_hardening.sql`

## Why This Is Needed

Read-only Supabase production advisors for project `fyxltykqdvacbdgmeucf`
reported:

- mutable function `search_path` settings
- direct `PUBLIC`, `anon`, or `authenticated` execute grants on helper and
  `SECURITY DEFINER` functions

The prepared migration keeps app behavior unchanged while reducing direct RPC
attack surface. It targets helper functions used by triggers or backend
service-role paths.

## Current State

The reviewed SQL was applied to production on 2026-05-08 via direct Supabase SQL
execution after owner authorization. Staging remained unavailable/inactive and
the Supabase migration API refused the apply, so Supabase migration history was
not updated.

Observed apply-path blockers:

- staging DB host `db.nltfedbnbbrclcufoaly.supabase.co` does not resolve
- production `PROD_SUPABASE_DB_URL` fails password authentication
- the Supabase migration API refused the production apply for safety reasons

Post-apply production verification confirmed the targeted functions now use
`search_path=public` and no longer grant direct `anon`/`authenticated` execute.
Post-apply security advisors no longer report the mutable search-path or direct
security-definer execute warnings.

Remaining task: reconcile migration history when valid DB URL access is restored
so the local migration file and Supabase migration ledger are aligned.

## Apply Path A — Repo Script

Use this path when valid DB URLs are available in `.env.local` to reconcile
migration history and future schema changes.

Required variables:

```bash
STAGING_SUPABASE_DB_URL=postgresql://postgres:[password]@db.[staging-ref].supabase.co:5432/postgres
PROD_SUPABASE_DB_URL=postgresql://postgres:[password]@db.fyxltykqdvacbdgmeucf.supabase.co:5432/postgres
```

Apply to staging first:

```bash
bash scripts/deploy-migration.sh staging
```

Verify staging:

```bash
npx supabase migration list --db-url "$STAGING_SUPABASE_DB_URL"
```

Then apply to production:

```bash
bash scripts/deploy-migration.sh prod
```

Verify production:

```bash
npx supabase migration list --db-url "$PROD_SUPABASE_DB_URL"
```

## Apply Path B — Supabase Dashboard SQL Editor

Use this path only if DB URL access remains unavailable and the owner approves a
dashboard apply.

1. Open Supabase project `AlphaVyuh` / `fyxltykqdvacbdgmeucf`.
2. Open SQL Editor.
3. Paste the full SQL from
   `supabase/migrations/20260508001000_public_launch_security_hardening.sql`.
4. Run the SQL once.
5. Save the dashboard query result or screenshot as evidence.
6. Record how migration history will be reconciled if dashboard SQL does not
   create a Supabase migration history entry.

Prefer Apply Path A when possible because it keeps migration history aligned.

## Post-Apply Verification SQL

Run this read-only query after applying:

```sql
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig as config,
  array_agg(format('%s=%s', grantee, privilege_type) order by grantee, privilege_type) as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join information_schema.routine_privileges rp
  on rp.specific_schema = n.nspname
 and rp.routine_name = p.proname
where n.nspname = 'public'
  and p.proname in (
    'handle_new_user_watchlist',
    'update_updated_at',
    'broker_credentials_set_updated_at',
    'compute_rs_score_for_date',
    'workflow_states_set_updated_at',
    'handle_new_user',
    'delete_broker_credentials',
    'get_encrypted_credential',
    'get_vcp_lookback',
    'rls_auto_enable'
  )
group by n.nspname, p.proname, p.oid, p.prosecdef, p.proconfig
order by p.proname, args;
```

Expected result:

- `config` includes `search_path=public` for the listed functions
- grants no longer include direct `anon=EXECUTE` or `authenticated=EXECUTE` for
  backend/service-role-only RPCs
- service-role execution remains available where backend jobs need it

## Advisor Verification

After applying, run Supabase security advisors again for project
`fyxltykqdvacbdgmeucf`.

Expected improvement:

- function search-path mutable warnings for the listed functions are resolved
- direct `anon` / `authenticated` execute warnings for the listed
  security-definer RPCs are resolved

Expected remaining owner-controlled items:

- Supabase Auth leaked-password protection must be enabled in the Supabase Auth
  settings UI
- broader performance advisor findings can remain tracked separately unless load
  testing makes them launch blockers

## PR Evidence Update

Production apply and advisor verification are complete via direct SQL execution.
PR #74 should record:

1. Update PR #74 with:
   - apply method: direct Supabase SQL execution
   - production project id
   - function grant/search-path verification evidence
   - post-apply advisor summary
2. Add the repository-required production-applied marker to the PR description.
3. Re-run the Migration Drift Check.
4. Merge only after the check is green and the PR remains otherwise safe.
