# Data model

> Load this file when writing migrations, Supabase queries, or anything that touches the schema. Ground truth is `supabase/migrations/` — this doc is a human-readable map of it.

## Tables (planned)

- `profiles` — 1:1 with `auth.users`, holds display name, preferences, subscription tier
- `broker_credentials` — encrypted broker API keys per user, per broker
- `watchlists` — user-owned lists of symbols
- `watchlist_items` — symbols in a watchlist, with notes
- `scans` — saved scan definitions (name + DSL)
- `scan_runs` — execution history of a scan, with result snapshot
- `orders` — orders placed through the platform (entry, exit, size, status)
- `trades` — closed round-trips, derived from orders, used for journal
- `trade_notes` — user-attached notes/screenshots on a trade
- `ai_feedback` — periodic AI-generated insights on the user's trading

## RLS principle

Every table has `user_id uuid references auth.users(id)`. Every policy is `user_id = auth.uid()`. Exceptions (e.g. shared watchlists in future) require an explicit design note in this file.

## Encryption

Broker credentials use `pgsodium` secret-box encryption keyed per-user. The raw key never leaves the DB; app code gets plaintext only via a security-definer function that checks `auth.uid()`.

## Types

Regenerate after every migration:

```bash
bun run db:types
```

This writes `lib/supabase/types.ts`. Commit the regenerated file in the same PR as the migration.
