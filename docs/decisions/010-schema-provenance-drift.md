# ADR 010 — Schema Provenance Drift

**Status:** Accepted — debt documented, partial reconciliation completed, audit pending  
**Date:** 2026-04-22 (updated 2026-04-23)  
**Scope:** All objects in `supabase/migrations/001` through `031`; prod project `fyxltykqdvacbdgmeucf`

---

## Context

### How the drift came about

alphavyuh's prod Supabase project was built during a fast-moving early phase where schema
changes were applied through three different paths:

1. **Direct SQL via Supabase dashboard** — applied immediately with no local file, producing
   timestamp-based migration history entries.
2. **Supabase MCP `apply_migration`** — programmatic but still created timestamp-based
   version numbers not matching local filenames.
3. **`supabase db push` from local files** — the correct path, but only adopted consistently
   after PR #23 (2026-04-22).

The result: prod's `supabase_migrations.schema_migrations` table contained **26 entries with
timestamp-based version numbers** (`20260414003714` through `20260422030652`), none of which
matched any file in `supabase/migrations/` (which uses sequential numbering `001`–`032`).

### What was discovered (2026-04-22)

When attempting to push migration 032 via CLI, the push failed:

```
Remote migration versions not found in local migrations directory.
```

`supabase migration list` confirmed the full picture: all 32 local files showed as
"unapplied"; all 26 timestamp entries showed as "remote only". The actual prod schema was
correct — tables, columns, functions, indexes, and RLS policies all existed and the product
was running — but the Supabase CLI had no way to reconcile the two histories.

### What was done to reconcile

**Step 1 — Register local files as applied on prod:**
```bash
for v in 001 002 ... 031; do
  npx supabase migration repair --status applied $v --db-url "$PROD_DB_URL"
done
```
This wrote rows into `schema_migrations` for each local file. No schema changes — metadata only.

**Step 2 — Revoke the 26 orphaned timestamp entries:**
```bash
npx supabase migration repair --status reverted \
  20260414003714 20260414003718 ... 20260422030652 \
  --db-url "$PROD_DB_URL"
```
This marked the timestamp entries as "reverted" in the history table. No rollback SQL ran —
prod schema objects created by those entries remain exactly as-is.

**Step 3 — Push migration 032:**
With the history aligned, `supabase db push` saw only `032` as pending and applied it cleanly.

**The assumption we made and did not verify:**  
Both repair operations assume that what the local migration files `001`–`031` would produce on
a fresh database is functionally equivalent to what the 26 timestamp-based migrations produced
on prod. We did not verify this.

---

## Current State

| Layer | State |
|---|---|
| Migration history table on prod | Aligned: 001–032 registered as applied, 26 timestamps as reverted |
| Migration history on staging | Aligned separately (one orphan `20260421034410` repaired as reverted) |
| Schema objects on prod | Exist and function correctly; provenance of 001–031 objects not verified |
| `check-migration-drift.yml` (PR #23) | Active — prevents future drift |
| Object equivalence audit | **Not done** |

The drift-check workflow prevents new drift. It does not close the pre-existing gap.

---

## Remaining Risk

We have not established that prod schema objects are byte-identical to what `001`–`031` would
produce on a fresh database. The following categories can diverge silently:

### Function bodies
`CREATE OR REPLACE FUNCTION` is idempotent on body content, but not on argument defaults,
`SECURITY DEFINER`/`INVOKER`, `LANGUAGE`, `RETURNS`, or `SET` clauses. A function applied via
dashboard with a slightly different signature than the local file would silently survive and only
surface when a caller passes arguments the new signature doesn't accept.

**Most likely candidate:** `get_vcp_lookback()` went through at least three versions on prod
(`vcp_lookback_function`, `030_vcp_lookback_optimise`, `029_consolidated`) before the local
file was applied. The local file uses `CREATE OR REPLACE`, so it would have overwritten the
body — but if the local file was applied via MCP (which records a timestamp version), it may
not be byte-identical to what `029_vcp_lookback_rpc_function.sql` would produce via `db push`.

### RLS policies
A policy applied via dashboard may have a different `USING` expression or policy name than the
local file, even if the functional effect is the same. Postgres does not support
`CREATE OR REPLACE POLICY` — policies must be dropped and re-created to change. If the local
file has `CREATE POLICY "Users can manage own X" ...` but the dashboard applied it as
`CREATE POLICY "Enable CRUD for users based on user_id" ...`, both policies exist and work, but
the local file's `DROP POLICY IF EXISTS` in a future migration targets the wrong name and
silently no-ops.

**This is the most dangerous category.** The signup trigger issue in M1 was exactly this
pattern: a differently-named trigger caused a future migration's `DROP TRIGGER` to silently
fail, leaving both the old and new trigger active.

### Indexes
`CREATE INDEX IF NOT EXISTS` in local files is safe. But if an index exists on prod under a
different name (because the dashboard-era SQL used a different name), the local file's index
would be created as a duplicate under the local name. Two identical indexes on the same columns
waste storage and slow writes, and the local name's index would be the one future migrations
reference.

### Column defaults and nullability
A column created via dashboard with `DEFAULT now()` instead of `DEFAULT NOW()`, or `NOT NULL`
omitted, is schema-identical but would differ in a `pg_dump` text comparison. More seriously:
if a `NOT NULL` constraint was intended by the local file but omitted in the dashboard SQL, the
column accepts nulls that the application doesn't expect.

### Triggers
Unlike functions, triggers have no `CREATE OR REPLACE`. A differently-named trigger from the
dashboard era survives alongside any trigger the local file would create.

---

## Committed Resolution Plan

**Deadline: 2026-05-31** (before M5 begins, or before any migration that alters objects
from migrations 001–031 — whichever comes first).

### Procedure

**1. Dump prod schema:**
```bash
pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  "postgresql://postgres:<password>@db.fyxltykqdvacbdgmeucf.supabase.co:5432/postgres" \
  > /tmp/prod_schema.sql
```

> **Network access note:** `pg_dump` requires a direct Postgres connection (port 5432).
> The sandbox Claude Code runs in cannot reach this port due to Supabase Network Restrictions.
> This step must be run from a machine whose IP is allowlisted — either a developer's laptop
> (current working approach) or a GitHub Actions runner with a static IP added to the allowlist.
> If Network Restrictions block this, the alternative is `supabase db dump --linked --schema-only`
> which uses the Supabase Management API and does not require port 5432 access.

**2. Generate local schema:**
```bash
# In a separate terminal or temp directory — do not run on the linked local project
supabase db start          # starts local Postgres in Docker
supabase db reset          # runs 001→031 in sequence on a fresh local DB
pg_dump \
  --schema-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  "postgresql://postgres:postgres@localhost:54322/postgres" \
  > /tmp/local_schema.sql
```

**3. Normalize and diff:**
```bash
# Remove timestamps, OIDs, and other noise before diffing
pg_format /tmp/prod_schema.sql  > /tmp/prod_norm.sql
pg_format /tmp/local_schema.sql > /tmp/local_norm.sql
diff /tmp/prod_norm.sql /tmp/local_norm.sql
```

**4. Resolve each difference:**

| Diff type | Resolution |
|---|---|
| Prod has object local doesn't | Write a new migration to add it locally (do not edit existing files) |
| Local would produce different version | Write a new migration to reconcile prod to canonical form |
| Name-only difference (same logic) | Write a new migration that DROPs the misnamed prod object and re-creates under the canonical name |
| Functionally equivalent but text differs | Accept as-is; document in the audit report |

**5. Commit the audit result:**  
Save the diff output and resolution notes as `docs/schema-equivalence-audit-2026-05.md`.
This document is the proof that ADR 010 debt is resolved.

---

## Acceptance Criteria

- [ ] `pg_dump` diff between prod and a fresh-from-local-files DB is produced and reviewed.
- [ ] Every difference is either reconciled (via new migration) or explicitly accepted
      (documented in the audit report with rationale).
- [ ] `docs/schema-equivalence-audit-2026-05.md` committed and linked from this ADR.
- [ ] No migration between now and the deadline touches objects from 001–031 without first
      completing the audit for those specific objects.

---

## Process Guardrails (already in place)

**`check-migration-drift.yml` (PR #23):**
- Blocks merge of any PR touching `supabase/migrations/` without
  `<!-- migration-applied-to-prod -->` in the PR description.
- Enforces append-only (no editing existing migration files).
- Does not verify object equivalence — that remains a manual audit step.

**Stop hook:**
- Runs `tsc --noEmit` before Claude Code declares a task done.
- Does not check for unapplied migrations. CLI auth in CI would be required.
  The drift-check workflow is the compensating control.

**Rule: write the file first, then apply.** The root cause of every drift incident in this
project was applying SQL before committing a local file. The correct sequence is always:
1. Write the migration file locally.
2. Commit and push.
3. Apply to staging via CLI, verify.
4. Apply to prod via CLI, verify.
5. Add `<!-- migration-applied-to-prod -->` to the PR, merge.

---

## Lessons

1. **Dashboard SQL is the enemy of provenance.** Every schema change applied via dashboard
   creates a timestamp-based record that the CLI cannot reconcile with local files. The rule
   is absolute: no schema changes via dashboard, ever. If the CLI can't reach prod (IP
   restriction), fix the IP restriction — don't revert to dashboard.

2. **MCP `apply_migration` also creates timestamp entries.** It is better than dashboard SQL
   (the name field is set), but it still does not produce a record that `supabase migration list`
   can match to a local file. Use it only as a last resort when CLI access is unavailable, and
   immediately create a stub file to close the count gap.

3. **`repair --status reverted` is safe but leaves an implicit assumption.** Marking old
   entries as reverted does not verify that the objects they created match the local files.
   The reconciliation procedure above is the only way to close that assumption.

4. **The M1 signup trigger incident was this pattern.** A differently-named trigger from an
   earlier dashboard session survived alongside the trigger the local migration created, causing
   double-firing. Schema equivalence audits catch this before it reaches prod.
