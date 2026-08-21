# Decision 020 — durable post-trade review records

Date: 2026-08-20

## Decision

Add an owner-scoped `trade_reviews` table keyed by `(user_id, journal_entry_id)` and linked to the optional durable `setup_id`. The review resource stores plan adherence, mistakes, lesson, follow-up, source, status, and timestamps. The authenticated API uses an RLS-scoped Supabase client for list, read, and save operations.

## Compatibility boundary

The existing `trade_journal.mistakes` and `trade_journal.lessons` fields remain readable for the current journal UI and older clients. A database trigger synchronizes those fields into `trade_reviews` when a closed trade is updated. Explicit review API writes keep the richer review fields without overwriting them during later journal synchronization.

## Safety and verification

- Review writes require an owned, closed journal entry.
- RLS uses `auth.uid() = user_id`; composite foreign keys prevent cross-user journal or setup links.
- The migration is additive and does not edit an applied migration.
- Local contract and ownership tests cover the table, policy, lineage, closed-trade gate, and payload.
- The migration is not considered applied or production-ready until the intended AlphaVyuh Supabase project is reachable and authenticated two-user checks pass.
