# Sector Source Approval Visibility

## Scope
- Added explicit sector source approval copy to the taxonomy presentation model.
- Data Trust now shows a separate "Sector source approval" tile and freshness detail row, so source/audit approval is not inferred from raw taxonomy metadata.
- Launch contract now reports sector source as `APPROVED` only when taxonomy status is clean; otherwise it stays `APPROVAL PENDING`.

## Branch / Worktree
- Branch: `codex/sector-source-approval`
- Worktree: `/private/tmp/alphavyuh-sector-source-approval`

## Files Changed
- `frontend/lib/sector-taxonomy-copy.ts`
- `frontend/lib/launch-agenda.ts`
- `frontend/app/(app)/data/page.tsx`
- `frontend/tests/unit/sector-taxonomy-copy.test.ts`
- `frontend/tests/unit/launch-agenda.test.ts`
- `docs/agent-runs/2026-06-01-sector-source-approval.md`

## Tests Run
- `npm --prefix frontend run test -- tests/unit/sector-taxonomy-copy.test.ts tests/unit/launch-agenda.test.ts`
- `npm exec eslint 'app/(app)/data/page.tsx' lib/sector-taxonomy-copy.ts lib/launch-agenda.ts tests/unit/sector-taxonomy-copy.test.ts tests/unit/launch-agenda.test.ts`
- `npm --prefix frontend run typecheck`
- `npm run e2e:layout`
- `git diff --check`

## Open Decisions
- Owner/data approval is still required before AlphaVyuh markets sector or industry rankings as final.
- Decide whether the taxonomy approval should be backed by a persisted admin approval record after the NSE industry parity audit.

## Known Risks
- This is a visibility and launch-contract improvement; it does not perform the underlying NSE industry taxonomy parity audit.
- If metadata is unavailable, the UI correctly marks source approval unavailable instead of treating sector counts as approved.

## Next Steps
- Open a PR and wait for hosted checks.
- Continue with founder onboarding/QA polish or final launch documentation after merge.
