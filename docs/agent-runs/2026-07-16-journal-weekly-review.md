# Journal weekly review and setup adherence

## Why this slice exists

AlphaVyuh's journal recorded outcomes, but did not make the decision process easy to review. This slice adds a small, evidence-linked weekly review rather than a score, prediction, or coaching claim.

## Product contract

- A closed trade may receive one explicit process review: planned setup, setup adherence, rule breaks, and lesson.
- Adherence is one of `followed`, `partial`, `not_followed`, or `not_applicable`.
- Existing lesson text is not treated as proof that a structured review happened. Legacy entries remain **Needs review** until the new review is saved.
- Weekly summaries cover completed Monday-Sunday periods in `Asia/Kolkata`, based on the trade exit date.
- The adherence denominator excludes `not_applicable` reviews.
- Weekly evidence contains counts and source entry IDs, not P&L, rankings, advice, or an opaque score.
- Drill-through revalidates every requested entry against the authenticated owner, completed week, and optional rule break before returning the journal rows.

## Trust and compatibility decisions

- Review metadata is nullable and has no historical backfill.
- `review_schema_version` distinguishes explicit reviews from old journal content.
- The mutation is owner-scoped and uses `expected_updated_at` for optimistic concurrency.
- The generic journal update path also repeats the authenticated owner predicate at the write sink.
- The database constraint requires every structured review field to be non-null and valid when schema version 1 is present.
- Direct authenticated writes to server-owned review metadata are blocked by a database trigger.
- Weekly aggregation is computed in one database call so the API never labels mutable offset pagination as complete coverage.
- Evidence requests are limited to the latest 12 completed weeks and repeat the account's journal-history entitlement inside the database snapshot.
- Malformed or unavailable weekly evidence fails closed in the UI.
- Telemetry records only the interaction method and does not include setup, lesson, rule-break, symbol, or journal-entry content.

## UX decisions

- Weekly review is an explicit journal tab, not a new primary-navigation destination.
- Cards separate reviewed trades, applicable reviews, adherence counts, common rule breaks, and entries still needing review.
- Evidence links open the journal ledger only after server validation; locally loaded rows are not treated as complete evidence.
- Evidence sets above 500 entries are disclosed as capped and cannot open a misleading partial ledger.
- Saving, closing, importing, editing, or deleting a trade invalidates the weekly summary so stale counts are not retained.
- The layout uses the existing journal tokens and components and remains usable at desktop and mobile widths.

## Verification

The implementation is covered by backend contract and ownership tests, frontend normalization and interaction tests, full frontend and backend suites, TypeScript/build/lint checks, and real browser review at desktop and mobile widths.

## Owner gates

- Review and apply `20260716160000_journal_process_reviews.sql` in the intended Supabase environment.
- Verify the live RLS, trigger, RPC grants, and schema after migration.
- Do not mark the migration as applied or deploy this slice until those checks are approved.
