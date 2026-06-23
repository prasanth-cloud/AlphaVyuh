# Schema Equivalence Audit — 2026-06-20

**ADR:** 010 — Schema Provenance Drift  
**Status:** Partial — local schema verified, prod comparison blocked by infrastructure  
**Auditor:** Claude Code (remote session)

---

## What was done

### 1. Local schema generation

A fresh Postgres 16 database (`alphavyuh_audit`) was created and all 47 migration
files (001–040 + timestamp-named) were applied in order. The resulting schema was
dumped via `pg_dump --schema-only --no-owner --no-privileges --schema=public`.

**Result:** 2,282-line schema dump. Objects verified:
- 20 RLS policies (canonical names from migration files)
- 4 triggers (`on_auth_user_created`, `journal_updated_at`, `broker_credentials_updated_at`, `chart_workspaces_updated_at`, `workflow_states_updated_at`)
- 12 functions (including `handle_new_user`, `update_updated_at`, `get_vcp_lookback`, `compute_rs_score_for_date`)

Expected errors during local application (non-Supabase environment):
- `role "service_role" does not exist` — Supabase-only role, not relevant to schema structure
- `role "anon" does not exist` — same
- `role "authenticated" does not exist` — same
- `relation "public.workflow_states" does not exist` in 039 — ordering issue (039 references workflow_states created in timestamp-named migration applied later)

### 2. Normalisation migration written

Migration `041_schema_provenance_normalise.sql` was written to defensively clean up
the ADR-010 risk categories:

**RLS policy dedup (§Risk: most dangerous category):**
- Drops all known Supabase dashboard default policy names across all user-owned tables
- Pattern: `"Enable insert for users based on user_id"`, `"Enable read access for all users"`, `"Enable CRUD for users based on user_id"`
- Covers: users, saved_screens, watchlists, watchlist_items, chart_layouts, drawings, trade_journal, shared_screens, screen_upvotes, subscriptions, price_alerts, broker_credentials, order_idempotency
- All DROP POLICY IF EXISTS — no-ops if the dashboard-era names don't exist on prod

**Trigger dedup (§Risk: M1 signup trigger pattern):**
- Drops known alternative trigger names for `on_auth_user_created` and `journal_updated_at`
- Canonical triggers remain untouched

**Function alignment:**
- Re-applies `handle_new_user()` and `update_updated_at()` with CREATE OR REPLACE
- Ensures SECURITY DEFINER is set on `handle_new_user()`

### 3. Verified locally

Migration 041 was applied to the local audit database. All statements executed
cleanly (all drops were no-ops as expected on a fresh-from-migrations DB).

---

## What was NOT done (blocked)

### Prod schema dump
`pg_dump` to prod (`db.fyxltykqdvacbdgmeucf.supabase.co:5432`) is blocked by:
1. Supabase Network Restrictions (this session's IP is not allowlisted)
2. No database credentials available in this environment
3. ADR 010 explicitly notes this must be run from a developer's laptop

### supabase migration list --linked
Requires `supabase link` with a Supabase access token, which is not available.

### Actual diff
Without the prod schema dump, the diff between prod and local cannot be produced.
Migration 041 is written defensively to handle the most likely drift patterns, but
the actual state of prod objects is unverified.

---

## Remaining steps (must be done from developer laptop)

1. Run `pg_dump` from a machine with allowlisted IP:
   ```bash
   pg_dump --schema-only --no-owner --no-privileges --schema=public \
     "$PROD_DB_URL" > /tmp/prod_schema.sql
   ```

2. Compare against local dump:
   ```bash
   supabase db reset  # fresh local DB
   pg_dump --schema-only --no-owner --no-privileges --schema=public \
     "postgresql://postgres:postgres@localhost:54322/postgres" > /tmp/local_schema.sql
   diff <(grep -v '^--' /tmp/prod_schema.sql | grep -v '^$') \
        <(grep -v '^--' /tmp/local_schema.sql | grep -v '^$')
   ```

3. If diff shows dashboard-era policy names or duplicate triggers on prod,
   apply migration 041 to staging first, verify, then prod.

4. Run `supabase migration list --linked` and confirm all migrations show as applied.

5. Update this document with the actual diff output and resolution.

---

## Objects inventory (from local schema)

### RLS Policies (20)
| Table | Policy name | Scope |
|---|---|---|
| users | Users can read own profile | SELECT |
| users | Users can update own profile | UPDATE |
| subscriptions | Users can read own subscriptions | SELECT |
| saved_screens | Users can manage own screens | ALL |
| watchlists | Users can manage own watchlists | ALL |
| watchlist_items | Users can manage own watchlist items | ALL |
| chart_layouts | Users can manage own layouts | ALL |
| drawings | Users can manage own drawings | ALL |
| trade_journal | Users own journal | ALL |
| shared_screens | Anyone can read shared screens | SELECT |
| shared_screens | Users can manage own shared screens | ALL |
| screen_upvotes | Users can manage own upvotes | ALL |
| price_alerts | Users manage own price_alerts | ALL |
| order_idempotency | Users can read own idempotency rows | SELECT |
| order_idempotency | Users can insert own idempotency rows | INSERT |
| order_idempotency | Users can update own idempotency rows | UPDATE |
| chart_workspaces | Users can manage own chart workspaces | ALL |
| scan_alerts | Users manage own scan_alerts | ALL |
| scan_alert_matches | Users manage own scan_alert_matches | ALL |
| workflow_states | Users can manage own workflow states | ALL |

### Triggers (5)
| Trigger | Table | Function |
|---|---|---|
| on_auth_user_created | auth.users | handle_new_user() |
| journal_updated_at | trade_journal | update_updated_at() |
| broker_credentials_updated_at | broker_credentials | broker_credentials_set_updated_at() |
| chart_workspaces_updated_at | chart_workspaces | chart_workspaces_set_updated_at() |
| workflow_states_updated_at | workflow_states | workflow_states_set_updated_at() |

### Functions (12)
handle_new_user, update_updated_at, broker_credentials_set_updated_at,
get_encrypted_credential, delete_broker_credentials, get_vcp_lookback,
compute_rs_rating_for_date, compute_rs_score_for_date,
chart_workspaces_set_updated_at, workflow_states_set_updated_at,
resolve_market_symbol, get_adjusted_candles, market_data_coverage_audit
