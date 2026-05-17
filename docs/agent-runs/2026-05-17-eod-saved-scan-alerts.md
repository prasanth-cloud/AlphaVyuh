# EOD Saved Scan Alerts

Date: 2026-05-17
Branch: `codex/eod-saved-scan-alerts`
Issue: #114

## Agent Roster

- Manager: integrated scope, shipped the mock-first UI/API/backend safety pass, and prepared PR validation.
- Product Agent Pauli: scoped this as an in-app EOD scan-match digest instead of Telegram-first alerts.
- Backend/Data Agent McClintock: identified existing scan-alert backend/API pieces, missing mock UX, and route/schema risks.
- QA Agent Aquinas: defined route ordering, sort validation, mock alert, and e2e digest coverage.

## What Changed

- Replaced the placeholder `/alerts` page with an EOD scan alert center.
- Added mock scan-alert state, recent match snapshots, pause/resume, and delete behavior.
- Added a scanner-side `Add EOD alert` flow that saves the current filter/sort snapshot.
- Kept alert copy EOD-only and review-focused, with no buy/sell/recommended wording.
- Fixed backend scan-alert route ordering so `/alerts/recent/matches` is not shadowed by `/{alert_id}/matches`.
- Added backend scan-alert sort validation on create/update.
- Updated old Telegram summary copy from Artha to AlphaVyuh.
- Added unit, backend, and e2e coverage for the new alert loop.
- Tightened the layout light-theme test so route checks re-apply the saved theme before each assertion.

## Why

Saved scan alerts make AlphaVyuh more habitual: traders can save a useful screen once, then review the latest EOD matches from one place after market data refresh. This improves retention without adding live-data or broker-execution risk.

## What We Learned

- The backend already had most scan-alert primitives; the missing piece was a trader-facing alert center and mock-mode continuity.
- Telegram should remain secondary until the in-app loop is proven, because per-symbol notifications can become noisy quickly.
- The alert route order was a real backend correctness risk and easy to fix before building more UI on top of it.
- The existing EOD alert stack still has deeper live parity work: local migration visibility, cron/script triggering, scanner filter parity, and Telegram count freshness.

## Improve Next

- Add/verify the Supabase migration that owns `scan_alerts` and `scan_alert_matches` in this repo.
- Make the daily refresh script trigger `run_all_alerts` when EOD ingest runs outside the FastAPI scheduler.
- Reuse the full scanner execution path for alert matching so VCP and richer filters stay identical.
- Add an unread/reviewed state after real users confirm the digest flow is useful.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `backend/.venv/bin/python -m pytest backend/tests/test_scan_alerts.py backend/tests/test_scanner_filters.py`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`
- `npm audit --audit-level=moderate`
