---
name: add-migration
description: Workflow for safely adding a new Supabase migration to AlphaVyuh
trigger: Use when you need to add a new table, column, index, or policy to the database
---

# Add Migration

## When to use
You need to change the database schema: new table, new column, new index, new RLS policy, or a data backfill.

## Rules
- See `.claude/rules/database.md` for full invariants
- **Never edit an existing migration** — always add a new file
- Next migration number: check `supabase/migrations/` and increment by 1

## Step 1 — Determine the next number
```bash
ls supabase/migrations/ | sort
```
If the last file is `015_referrals_community.sql`, the next is `016_<description>.sql`.

## Step 2 — Write the migration
Create `supabase/migrations/016_<description>.sql`:

```sql
-- Brief description of what this migration does

-- Always use IF NOT EXISTS / IF EXISTS guards
alter table public.<table>
  add column if not exists <column> <type> not null default <value>;

-- For new tables:
create table if not exists public.<table> (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.<table> enable row level security;
create policy "Users can manage own <table>" on public.<table>
  for all using (auth.uid() = user_id);

create index if not exists idx_<table>_user on public.<table>(user_id);
```

## Step 3 — Review checklist
- [ ] Uses `if not exists` / `if exists` guards (safe to re-run)
- [ ] New tables have `enable row level security`
- [ ] RLS policies cover both read and write as appropriate
- [ ] Indexes added for FK columns and common query columns
- [ ] No destructive operations (DROP TABLE, DROP COLUMN) without approval
- [ ] If adding a column to `payment_logs`: wrap in `DO $$ IF EXISTS $$` (created at runtime)

## Step 4 — Apply
1. Open Supabase dashboard → SQL Editor
2. Paste the migration file contents
3. Run it
4. Confirm no errors

## Step 5 — Update backend code
If you added columns, update the relevant router's `select(...)` calls to include them.

## Never do
- Edit a file in `supabase/migrations/` that already exists
- Write a migration without RLS on a new user-owned table
- Use `DROP COLUMN` or `DROP TABLE` — use soft deletes or leave unused columns
- Apply to production before testing on a staging/dev Supabase project
