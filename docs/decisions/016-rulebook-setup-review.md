# 016 — Rulebook-backed setup review gate

Date: 2026-08-20

## Decision

Use the existing durable `setup_id` as the identity for rulebook evaluation. Before a watchlist plan can be marked `ready` or saved into journal/order capture, AlphaVyuh must synchronize the plan to the owner-scoped setup record, evaluate the active rulebook, and record the result.

The starter rulebook hard-blocks invalid level geometry, non-positive risk, missing whole-number quantity, planned R:R below the configured minimum, and a missing thesis. Missing invalidation is a checklist warning that requires an explicit override reason. Optional maximum risk amount and account-risk percentage checks are warnings.

## Boundaries

- Evaluation is deterministic and non-advisory; it does not create signals or place broker orders.
- Browser code never uses a service-role key and never calls a broker order endpoint as part of review.
- The backend uses the authenticated user JWT for Supabase queries and filters every rulebook, setup, and evaluation by the owner.
- Live migration application and production validation require the correct AlphaVyuh Supabase project; source changes alone do not claim production readiness.

## Consequences

- Editing a reviewed plan revokes its Ready state and requires a fresh evaluation.
- Mock mode uses the same rule definitions and persists rulebooks/reviews in local storage so browser tests exercise the same user flow.
- Evaluation history is currently stored as the latest result per user/setup/rulebook; a future review-intelligence milestone can add append-only history if needed.
