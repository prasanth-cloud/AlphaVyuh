# QA Report — Dashboard + Scanner TV Polish

**Branch:** `feat/scanner-tv-polish`  
**Date:** 2026-06-10

## Coverage

| Surface | Buttons / flows exercised | Status |
|---------|---------------------------|--------|
| Dashboard | Index tape (3 indices), regime strip, sector grid, nav | Pass (mock) |
| Scanner | Screeners (3 + More), Technicals/Fundamentals collapse, Run scan | Pass |
| Scanner results | List/Charts, Columns, History, sort headers, Shortlist, ⋯ menu | Pass |
| Scanner row | Row click → chart, add to watchlist via menu | Pass |
| Watchlist | Decision desk loads after chart handoff | Pass |

**Walkthrough video (mock auth):** `frontend/docs/qa-videos/alphavyuh-tv-polish-walkthrough.webm`

Re-record after deploy:

```bash
cd frontend
npm run e2e:qa-video          # local mock
npm run e2e:qa-video:prod     # production (requires signed-in QA session)
```

## Issues found and fixed

| Issue | Impact | Fix |
|-------|--------|-----|
| History hidden after reload when no active scan | Users could not restore prior runs | History button visible when `runHistory.length > 0` even before Run scan |
| Row expansion removed but e2e still expected inline “Why this matched” | CI failures | Updated e2e for row→chart and symbol-column screen tags |
| Watchlist add removed from row; only in ⋯ menu | Shortlist→watchlist flow broke in tests | Tests use “Add to {name}” in More actions menu |
| Typography felt dense / loud on scanner header | UX polish | `calm-page-title`, `calm-page-copy`, softer chip labels, table sizing |

## Verification

```text
npm run typecheck          → pass
npm run lint               → pass (dashboard dead-code warnings only)
npm run test -- scanner-detail-watchlist-feedback-source scanner-result-columns today-copy-source → 9 passed
npm run e2e:mock           → 17 passed
npm run e2e:qa-video       → 1 passed (video recorded)
```

## Remaining / not in this branch

- Production deploy video: run `e2e:qa-video:prod` after merge + Vercel deploy with QA credentials.
- Dashboard `page.tsx` dead cockpit components (lint warnings) — cleanup deferred.
- Layout e2e intermittent server crash on long suite (port 3002); scanner-specific cases pass when server stays up.

## Calm typography changes

- Page titles: 22–26px, weight 500, relaxed letter-spacing
- Body copy: 12px secondary line-height 1.55
- Regime/tape labels: 11px, medium weight, reduced tracking
- Scanner table: 12px cells, compact padding
- Chip buttons: 11px, weight 500
