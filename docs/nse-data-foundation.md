# NSE Data Foundation

AlphaVyuh's default market-data foundation is official NSE bhavcopy data. This is the correct low-cost beta path for Indian swing trading: it is complete after market close, stable for scanning, and suitable for daily/weekly/monthly charting.

## Beta Data Target

- Active NSE EQ universe available in search, scanner, watchlist, and chart routes.
- At least five years of daily OHLCV rows for active NSE EQ symbols where NSE historical bhavcopy data exists.
- Dashboard breadth built from the latest high-coverage complete session.
- Charts must explain limited history instead of silently showing a short range.
- Symbol renames can be mapped through `symbol_aliases` so old NSE archive names do not pollute the active universe.
- Split/bonus-adjusted candles are available through `get_adjusted_candles` for long-horizon chart/backtest paths that opt in to adjusted history.

## Operator Commands

Latest production audit after historical backfill on 2026-05-11:

```text
Active NSE EQ symbols: 2508
Latest covered trade date: 2026-05-11
Symbols on latest date: 2452
5Y chart-ready: 1446
Partial history: 1062
Missing history: 0
```

Before the backfill, `5Y chart-ready` was 0 and most established symbols had about 226-227 trading rows. The remaining partial-history symbols are mostly newer listings, renamed symbols, or symbols whose historical NSE archive identity does not map cleanly to the current active symbol.

Audit current coverage:

```bash
cd backend
python scripts/audit_market_data_coverage.py
```

When migration `20260511193000_data_quality_foundation.sql` is applied, the audit uses the database-side `market_data_coverage_audit()` RPC. That keeps the check fast even after five years of OHLCV history has been loaded.

Backfill five years by default:

```bash
cd backend
python scripts/backfill_bhavcopy.py
```

Historical backfill intentionally does not update `stock_universe.is_active`. The current active NSE universe must come from the latest daily refresh so old bhavcopy files do not revive delisted or inactive symbols. Historical OHLCV rows are filtered to symbols already present in the active universe before insert.

Backfill a bounded window when NSE throttles:

```bash
cd backend
python scripts/backfill_bhavcopy.py --start-date 2021-01-01 --end-date 2021-12-31 --skip-indicators
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
