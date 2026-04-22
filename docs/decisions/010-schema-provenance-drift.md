# ADR 010 — Schema Provenance Drift (Migrations 026–031)

**Status:** Accepted — debt documented with deadline  
**Date:** 2026-04-22  
**Author:** Engineering  
**Scope:** `daily_ohlcv`, `broker_credentials`, `users` table, `get_vcp_lookback` RPC function

---

## Context

During the production auth fix (2026-04-22), a migration audit revealed that prod Supabase project `fyxltykqdvacbdgmeucf` had accumulated **schema provenance drift**: the same schema objects were created through two different paths.

### What happened

| Local file | Prod migration record | Path |
|---|---|---|
| `026_broker_credentials.sql` | `026_broker_credentials` (v20260421024729) | Local file → MCP apply |
| `027_users_broker_telegram.sql` | No single record — columns added via `add_telegram_chat_id_to_users` (v20260416021326) + `add_broker_columns_to_users` (v20260416225822) | Direct SQL at earlier dates |
| `028_daily_ohlcv_sepa_columns.sql` | `028_daily_ohlcv_sepa_columns` (v20260421034441) | Local file → MCP apply |
| `029_vcp_lookback_rpc_function.sql` | `029_vcp_lookback_rpc_function_consolidated` (v20260421121831) | Local file → MCP apply (consolidated) |
| *(no local file)* | `vcp_lookback_function` (v20260421115213) | Direct SQL — no local equivalent |
| *(no local file)* | `030_vcp_lookback_optimise` (v20260421120128) | Direct SQL — no local equivalent |

In plain language: the `get_vcp_lookback` function went through two intermediate versions (`vcp_lookback_function`, `030_vcp_lookback_optimise`) applied directly to prod without corresponding local migration files, then a consolidated version (`029`) was applied on top. The local file `029_vcp_lookback_rpc_function.sql` reflects the intended final state but was not the only path that shaped the function.

### What was done to close the immediate gap

1. Migration `027_users_broker_telegram` was applied via MCP (safe no-op; all columns were `ADD COLUMN IF NOT EXISTS` and already present).
2. Stub files `030_vcp_lookback_initial_stub.sql` and `031_vcp_lookback_optimise_stub.sql` were created in `supabase/migrations/` as documentation-only entries (no executable SQL). These align the local file count with the prod migration record count and prevent false positives in the drift check workflow.
3. `check-migration-drift.yml` was added (PR #23) to enforce the process going forward.

---

## Remaining Risk

**We have not verified object equivalence.** Specifically:

### `get_vcp_lookback()` RPC function
The function currently in prod was created by `029_vcp_lookback_rpc_function_consolidated` applied on top of two intermediate `CREATE OR REPLACE` versions. The function body was retrieved from prod via `pg_get_functiondef()` and matches the intent of `029_vcp_lookback_rpc_function.sql`, but we have not done a byte-level comparison between:
- What `029_vcp_lookback_rpc_function.sql` would create on a fresh database
- What currently exists in prod (which was shaped by three sequential `CREATE OR REPLACE` operations)

**Likely identical** — `CREATE OR REPLACE FUNCTION` is idempotent on the body — but not verified.

### `broker_credentials` table
Applied via MCP using the local file content. Risk is low since the SQL ran exactly once from the file. No intermediate versions. Considered verified.

### `daily_ohlcv` SEPA columns
Applied via MCP using the local file content. Indexes were created `IF NOT EXISTS`. Risk is low. Considered verified.

### `users` table columns (027 objects)
Columns were applied via two separate earlier migrations, not the local `027` file. The column names and types match the local file exactly (confirmed via `information_schema.columns` query on 2026-04-22). The only difference: the local file would have added all five columns in one transaction; prod added them in two separate transactions at different dates. Functional impact: none.

### Migration history naming mismatch
Local migration files use sequential numbering (`NNN_name.sql`). Prod migration history uses timestamp-based version numbers (`YYYYMMDDHHMMSS`). The Supabase CLI's `supabase migration list` cannot match local files to remote records by name; it would incorrectly report all local files as "unapplied." The drift check workflow uses a count-based heuristic instead of name matching. This is a known limitation documented below.

---

## Committed Resolution

**By 2026-05-31 (before M5 or before any migration that alters objects from migrations 026–031, whichever comes first):**

1. Run `pg_dump --schema-only` on prod (`fyxltykqdvacbdgmeucf`).
2. Run `supabase db reset` on a local clone seeded from the migration files in sequence (001 → 031).
3. Diff the two outputs (normalize formatting with `pg_format` first to remove whitespace noise).
4. For any difference:
   - If prod has something local doesn't: write a new migration to add it locally.
   - If local would produce something different from prod: write a new migration to reconcile prod to the canonical form.
5. After reconciliation, commit the diff result as `docs/schema-equivalence-audit-2026-05.md` to document that this debt was resolved.

**Stretch goal (if Supabase CLI compatibility is reached):** Rename local migration files to timestamp format so `supabase migration list --linked` works correctly. This is a large mechanical rename but eliminates the naming mismatch permanently.

---

## Process Improvement (already implemented)

`check-migration-drift.yml` (PR #23) enforces going forward:
- Any PR touching `supabase/migrations/` posts a checklist comment requiring staging + prod application evidence.
- Merge is blocked until `<!-- migration-applied-to-prod -->` appears in the PR description.
- Modification of existing migration files is blocked (append-only enforcement).

The stop hook at session end runs typecheck but does not check for unapplied migrations. This gap is known; the CI check is the compensating control.

---

## Lessons

1. Applying migrations via MCP or dashboard during a debugging session — without creating a local file first — is the most common cause of this drift pattern. The rule: **write the file, commit it, then apply**. Never the reverse.
2. The absence of a `supabase migration list` step in the post-session checklist allowed the drift to accumulate across multiple sessions. Adding it to the Stop hook would be ideal but requires CLI auth in CI.
3. Stub files are a valid short-term technique for closing provenance gaps, but they obscure whether the prod schema actually matches the local files. The schema equivalence audit (committed by 2026-05-31) is the only way to close this properly.
