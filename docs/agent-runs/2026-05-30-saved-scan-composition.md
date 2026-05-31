# Saved Scan Composition

## Issue

- #282 Build setup review workspace from scanner to chart

## Done

- Added saved-screen composition for the scanner.
- Traders can select two or more saved screens, choose AND or OR, and run the composed result set.
- Composed rows preserve visible provenance through `screen_matches`, shown in the result row and row expansion.
- Added a pure composition helper and regression tests.
- Added a Playwright mock smoke that proves the saved-screen composition flow works end to end.

## Why

ChartsMaze-style scan composition is part of the setup-review workspace acceptance criteria. This lets a trader combine saved scans by actual matched symbols instead of guessing how filter objects overlap.

## Verification

- `npm --prefix frontend run test -- tests/unit/scanner-composition.test.ts tests/unit/scanner-workflow.test.ts tests/unit/scanner-api.test.ts`
- `npm --prefix frontend exec -- playwright test --config=frontend/playwright.mock.config.ts frontend/tests/e2e/workflow-mock.spec.ts -g "saved scanner screens can be composed"`
- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `git diff --check`

## Risk

- Composition currently combines the first page / 200-result saved-screen runs, matching the existing scanner launch cap.
- It does not create a persistent composed saved screen or alert. That should be a later backend/API slice if the owner wants recurring composed scans.

## Improve Next

- Persist composed scan definitions server-side so alerts/run history can execute AND/OR compositions after EOD refresh.
- Add audited industry-strength context after the sector taxonomy lane lands.

