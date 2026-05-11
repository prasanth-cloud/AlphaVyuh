# NSE Data Foundation

AlphaVyuh's default market-data foundation is official NSE bhavcopy data. This is the correct low-cost beta path for Indian swing trading: it is complete after market close, stable for scanning, and suitable for daily/weekly/monthly charting.

## Beta Data Target

- Active NSE EQ universe available in search, scanner, watchlist, and chart routes.
- At least five years of daily OHLCV rows for active NSE EQ symbols where NSE historical bhavcopy data exists.
- Dashboard breadth built from the latest high-coverage complete session.
- Charts must explain limited history instead of silently showing a short range.

## Operator Commands

Latest production audit on 2026-05-11:

```text
Active NSE EQ symbols: 2508
Latest covered trade date: 2026-05-11
Symbols on latest date: 2452
5Y chart-ready: 0
Partial history: 2508
Missing history: 0
Typical current depth: about 226-227 trading rows for established symbols
```

This means symbol coverage is broad, but historical depth still needs a bounded backfill before 5Y/10Y charts and strict long-horizon scanners are fully trustworthy.

Audit current coverage:

```bash
cd backend
python scripts/audit_market_data_coverage.py
```

Backfill five years by default:

```bash
cd backend
python scripts/backfill_bhavcopy.py
```

Backfill a bounded window when NSE throttles:

```bash
cd backend
python scripts/backfill_bhavcopy.py --start-date 2021-01-01 --end-date 2021-12-31
```

Recompute indicators only after raw OHLCV exists:

```bash
cd backend
python scripts/backfill_bhavcopy.py --indicators-only
```

Rebuild the dashboard breadth snapshot after backfill:

```bash
cd backend
python scripts/backfill_market_breadth_snapshot.py
```

## Why This Helps Traders

- Search and watchlists can cover the whole active NSE EQ universe instead of a curated subset.
- 5Y daily history enables meaningful weekly/monthly trend, base, breakout, and 52-week context.
- Market breadth becomes a real whole-market signal instead of a sample-size artifact.
- Scanner presets become more trustworthy because trend, volume, RS, and breakout fields are computed on a deeper history base.

## Known Limits

- NSE bhavcopy is not realtime intraday data.
- Newly listed stocks will not have five years of history; the UI should show the available range honestly.
- Delisted/suspended symbols may exist in old bhavcopy data but should not be treated as active unless `stock_universe.is_active` says so.
- Corporate action adjustment is not yet a full historical adjustment engine; price series should be verified for split/bonus edge cases before using long-horizon backtests.
