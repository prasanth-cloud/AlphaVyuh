# Broker Read-Only Evidence Pack

## Scope
- Added a broker read-only evidence summary that distinguishes incomplete, stale, unavailable, and owner-review-ready smoke evidence.
- Surfaced the evidence pack on `/settings/broker` so users can see pass counts, freshness, approval status, and blockers before any future execution discussion.
- Preserved the launch posture: evidence is not approval, order capture remains journal-only unless a separate owner-approved execution path exists.

## Branch / Worktree
- Branch: `codex/broker-readonly-evidence`
- Worktree: `/private/tmp/alphavyuh-broker-readonly-evidence`

## Files Changed
- `frontend/lib/broker-safety.ts`
- `frontend/app/(app)/settings/broker/page.tsx`
- `frontend/tests/unit/broker-safety.test.ts`
- `frontend/tests/e2e/broker-connect.spec.ts`
- `docs/agent-runs/2026-06-01-broker-readonly-evidence.md`

## Tests Run
- `npm --prefix frontend run test -- tests/unit/broker-safety.test.ts`
- `npm exec eslint 'app/(app)/settings/broker/page.tsx' lib/broker-safety.ts tests/unit/broker-safety.test.ts tests/e2e/broker-connect.spec.ts`
- `npm --prefix frontend run typecheck`
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key npm exec playwright test --config=playwright.mock.config.ts tests/e2e/broker-connect.spec.ts`
- `git diff --check`

## Verification Notes
- The first broker Playwright run failed before page render because this fresh worktree had no Supabase URL/key env for middleware.
- Rerunning with dummy local Supabase env values passed all mocked broker tests. No production Supabase, broker, billing, or deployment mutation was performed.

## Open Decisions
- Owner must still decide if and when sandbox/live order execution becomes a product objective.
- If execution is ever approved, the owner approval record should become a persisted admin workflow instead of static launch copy.

## Known Risks
- The evidence pack is derived from broker status payload fields. If the backend omits read-only smoke checks, the UI correctly treats the evidence as incomplete.
- The current pack is display-only; it does not persist a signed owner approval record.

## Next Steps
- Open a PR and wait for hosted checks.
- Continue with sector/source approval visibility or founder onboarding polish as the next isolated slice.
