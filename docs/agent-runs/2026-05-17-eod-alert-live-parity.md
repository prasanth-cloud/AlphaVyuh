# 2026-05-17 - EOD Alert Live Parity

Issue: #120  
Branch: `codex/eod-alert-live-parity`

## Agents

- Product/Data Agent - defined the user-safe parity bar for saved EOD scan alerts.
- Backend/Data Agent - inspected scanner, alert, EOD refresh, Telegram, and migration gaps.
- QA Agent - mapped regression coverage for scanner parity, scheduler/script execution, and current-run summaries.
- Manager Agent - integrated the implementation, validation, and PR handoff.

## Done

- Added the missing `scan_alerts` and `scan_alert_matches` Supabase migration with owner RLS, unique `(alert_id, run_date)`, and lookup indexes.
- Extracted the scanner execution path into `execute_scan()` so saved scan alerts use the same filter, sort, rich field, and VCP pass-2 behavior as the scanner UI.
- Wired `daily_refresh.py` to run saved scan alerts only after a trusted non-dry-run bhavcopy success or already-ingested day.
- Guarded the FastAPI scheduler so partial, skipped, failed, or empty bhavcopy runs do not trigger alert notifications.
- Changed Telegram summaries to use current-run match counts instead of stale pre-run `last_match_count`.
- Added run-status/error metadata to alert snapshots and surfaced skipped/failed states in the Alerts page.
- Updated mock alert state and Supabase generated types to match the new status fields.

## Why

Saved scan alerts are only useful if traders can trust that the digest exactly reflects the latest completed market session. This pass removes silent divergence between scanner results, alert snapshots, scheduler behavior, script behavior, and Telegram summaries.

## Learned

- The UI alert center was healthy, but the production EOD paths were split: FastAPI scheduler ran alerts broadly, while `daily_refresh.py` did not run alerts at all.
- Generated Supabase types listed scan-alert tables, but the repo did not contain the migration, which made local/prod reset parity risky.
- Telegram notification code was reading the alert rows fetched before the run, so counts could be yesterday's value.
- Supabase CLI is not installed in this environment, so the migration was created manually using the repo's numbered sequence.

## Improve Next

- Apply and verify `supabase/migrations/038_scan_alerts.sql` in the target Supabase environment before merging/deploying this branch.
- Add live job evidence after the next real EOD refresh: bhavcopy success, `scan_alerts` run metadata in `ingest_runs`, and an alert match row for a test saved scan.
- If alert volume grows, batch user-plan lookup inside `run_all_alerts()` instead of querying per alert.

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm --prefix frontend run test -- --run`
- `backend/.venv/bin/python -m pytest backend/tests/test_scan_alerts.py backend/tests/test_daily_refresh_alerts.py backend/tests/test_scanner_filters.py backend/tests/test_market_dates.py backend/tests/test_security_hardening.py`
- `npm audit --audit-level=moderate`
- `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt`
- `npm run test:e2e:layout`
- `npm run test:e2e:mock`
- `npm run test:e2e:perf`

Note: the first perf e2e attempt was started in parallel with mock e2e and failed because both tried to bind port 3002. It passed when rerun by itself.
