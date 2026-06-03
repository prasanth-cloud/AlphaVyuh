# Daily Refresh Bounds

Date: 2026-06-02

Branch: `codex/daily-refresh-bounds`

Worktree: `/private/tmp/alphavyuh-daily-refresh-bounds`

## Done

- Bounded the Daily NSE refresh yfinance supplement with `--yfinance-limit` and `--yfinance-time-budget-s`.
- Moved yfinance after the trusted core path: bhavcopy, market breadth snapshot, and saved scan alerts.
- Added `dry_run`, `yfinance_limit`, and `yfinance_time_budget_s` workflow-dispatch inputs so GitHub Actions can verify the workflow safely without production writes.
- Made `--dry-run` skip Supabase client construction entirely.
- Cleared the frontend `qs` moderate audit advisory with a lockfile-only transitive update.

## Why

The 2026-06-02 Daily NSE refresh was cancelled while running the long refresh step. A slow noncritical supplement should not block the trusted EOD data path or prevent a safe workflow proof.

## Learned

The yfinance supplement was sequenced before breadth snapshots and scan alerts, so supplement slowness could delay or prevent the trader-facing trusted data read models from updating. Dry-run also was not a true no-network rehearsal because it still created a Supabase client.

## Verification

- `backend/.venv/bin/python -m pytest backend/tests/test_daily_refresh_alerts.py`
- `backend/.venv/bin/python -m pytest backend/tests/test_daily_refresh_alerts.py backend/tests/test_market_dates.py backend/tests/test_market_breadth_snapshot.py backend/tests/test_scanner_filters.py`
- `SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=test-service-role-key backend/.venv/bin/python backend/scripts/daily_refresh.py --dry-run --force --date 2026-05-29 --yfinance-limit 2 --yfinance-time-budget-s 1`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:production-api-check`
- `npm run test:data-recovery-check`
- `npm run test:ci-action-runtime-check`
- `npm audit --audit-level=moderate`
- `git diff --check`

## Improve Next

- Dispatch the Daily NSE refresh workflow in dry-run mode from the PR branch and attach the run evidence.
- Continue the planned Today-first navigation and cockpit PR after this reliability slice is merged or safely queued.
