# Scanner Taxonomy Clutter And Latency Pass

## Scope

- Goal: make the scanner feel faster and less internal while preserving sector-audit trust evidence in Data Trust and launch checks.
- Branch/worktree: `codex/scanner-taxonomy-clutter-latency` at `/private/tmp/alphavyuh-issues-performance`.

## Changes

- Removed the scanner page's startup call to `getSectorsWithMetadata()`.
- Removed the scanner filter-panel sector taxonomy audit card and its local loading/error state.
- Kept sector strength visible with concise trader-facing copy: sector ranking is scan-local, while source audit details live in Data Trust.
- Updated the source guard test so scanner taxonomy audit details do not drift back into the scanner startup path.

## Why

- The scanner is a decision surface, not an operator audit screen.
- The extra taxonomy request added startup latency and showed internal contract language in the exact workflow where traders need faster scanning.
- Data Trust and release gates still preserve the sector taxonomy evidence and owner-gated audit posture.

## Verification

- `npm --prefix frontend run test -- tests/unit/scanner-detail-watchlist-feedback-source.test.ts` -> passed, 5 tests.
- `npm --prefix frontend run typecheck` -> passed.
- `npm run lint` -> passed.
- `npm run test:scanner-benchmark` -> passed after rerun with local test-server permission.
- `npm run test:e2e:layout` -> passed, 16 Chromium layout smoke tests.
- `git diff --check` -> passed.

## Open Decisions

- #285 remains open for owner/data approval and canonical NSE industry taxonomy parity.
- If users ask for sector audit details while scanning, prefer a small link to Data Trust rather than re-adding the full audit card.
