# AlphaVyuh EOD Refresh Operations

Date: 2026-05-07
Launch mode: Professional Access

AlphaVyuh Professional Access uses EOD/free-first market data. Do not describe
scanner, watchlist, or chart data as live unless a provider is explicitly
enabled and the UI shows that provider state.

## Daily Refresh Window

- Expected run: after NSE cash market close and after bhavcopy publication.
- Default target: latest completed trading session.
- Weekend/holiday behavior: no new EOD ingest is expected; the app should keep
  showing the latest successful EOD date with a non-live badge.

## Run Commands

From the backend directory:

```bash
python scripts/daily_refresh.py
```

For a specific trade date:

```bash
python scripts/daily_refresh.py --date YYYY-MM-DD
```

Fallback-only internal recovery when bhavcopy is unavailable:

```bash
python scripts/daily_refresh.py --yfinance-only
```

Use dry-run first when validating scheduler or environment changes:

```bash
python scripts/daily_refresh.py --dry-run
```

## Verification

After every refresh, check `/data` and confirm:

- latest EOD date matches the intended completed trading session
- source/provider is visible
- coverage is healthy or the degraded state explains why
- fallback/demo status is visible when active
- latest ingest status and row counts are visible
- dashboard, scanner, watchlist, and chart surfaces show the same as-of date

Backend evidence to collect:

- `ingest_runs` latest row id, status, errors, and completed timestamp
- latest `bhavcopy_ingestion_log` status and rows ingested
- any partial ingest warning or retry count

## Stale Or Degraded Data

Treat these as operator-facing warnings:

- latest successful EOD date is older than the latest completed NSE session
- coverage is below the expected active universe threshold
- latest ingest status is failed or partial
- scanner/chart data falls back to demo or fallback provider mode

Recovery sequence:

1. Confirm the target date was a trading day and bhavcopy was published.
2. Rerun `python scripts/daily_refresh.py --date YYYY-MM-DD`.
3. If bhavcopy is unavailable, keep the app in visibly labeled EOD/fallback mode.
4. Do not hide degraded state in the UI to make the product look healthier.
5. Record the failure and recovery notes in the launch issue or PR evidence.

## Professional Access Guardrails

- No production Supabase changes outside reviewed migrations.
- No paid/live provider switch without owner approval.
- No silent source mixing: if fallback is used, the UI must say so.
- No real broker smoke or order path belongs in EOD refresh operations.
