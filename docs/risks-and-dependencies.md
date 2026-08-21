# AlphaVyuh risks and dependencies

Audit date: 2026-08-20

## Safety and product boundaries

- AlphaVyuh must remain non-advisory. UI and API changes should describe plans, evidence, rules, and user decisions rather than guaranteed outcomes.
- No browser-side broker credentials or service-role Supabase keys.
- No live broker order is part of the setup-foundation slice. The existing live path remains owner-gated.
- Any future order path needs explicit confirmation, server-side calls, idempotency, durable audit events, broker status handling, and fill reconciliation. The local execution foundation now covers these contracts; applied-schema and owner-approved broker verification remain.
- Simulated order capture must remain clearly distinguishable from a real broker order.

## Schema and migration risk

The repository has an extensive migration history and existing schema-equivalence notes. New setup, lineage, review, job-evidence, audit, and broker-fill reconciliation migrations can be reviewed locally, but applying them to production or assuming migration parity requires owner approval and a database-backed check. The reconciliation API uses a server-side contract rather than the browser's generated Supabase types; regenerate those types if a future client-side Supabase query is introduced. The target project is currently inaccessible through the connected Supabase integration. Existing rows in workflow, journal, and broker-order tables must remain valid when `setup_id` is nullable.

The current workflow uniqueness `(user_id, symbol)` is retained for compatibility in the first slice. That means setup identity is stronger than the existing workflow key, but the old key is not removed until all consumers have moved to setup-aware behavior.

## Data and licensing dependencies

The attached plan depends on reliable NSE/BSE EOD data and indicator calculations. The source, licensing terms, symbol normalization, corporate-action treatment, timezone, missing-bar behavior, and freshness SLA must be documented before production use. The repository now rejects missing/invalid/duplicate EOD rows and records quality counters plus service-only job history, but that contract still needs a database-backed staging verification and source/licensing decision.

## Broker dependencies

Zerodha read-only verification, credential permissions, token expiry, rate limits, API availability, and account-level behavior must be tested separately. The new intraday path capture is Pro/Elite-only, Zerodha-only, and interval-limited to 5/15/30/60 minutes. It stores normalized OHLCV only; provider retention and interval granularity mean the result is not tick-level execution truth. Live execution also depends on legal/product review and a broker-safe test environment. Dhan, Upstox, derivatives, and options are later dependencies, not part of this implementation slice.

## Intraday path evidence

Path capture is a read-only enrichment of a closed journal row, not an order or recommendation. A missing migration, missing encrypted broker token, expired session, provider rate limit, or absent bars must leave the journal on its explicitly labeled EOD proxy or unavailable state. The migration and an owner-approved connected Zerodha capture still need verification in the correct Supabase project before this is described as production-ready.

## Current code risks

- Chart-plan drafts use local storage during handoff. The setup record reduces the durability gap, but draft cleanup, retry behavior, and offline failure UX still need explicit handling.
- The service-role backend client must continue to scope every setup query by the authenticated user id; database RLS is defense in depth, not permission to omit the application filter.
- Existing symbol-keyed workflow state can be overwritten by concurrent edits. Setup-aware writes should be additive first, with conflict/version behavior considered before replacing the existing key.
- Adding nullable foreign keys to existing tables is safer than backfilling blindly. A backfill needs a deterministic mapping and a separate reviewed migration.
- Current production health is not inferred from this repository audit. Any release or outage claim needs a fresh external check.

## External approvals required later

Production migrations, production data changes, deployment, billing, live broker execution, and any credential or OAuth changes require owner approval under the repository guidance. This task creates local implementation artifacts only and does not publish or mutate those external systems.
