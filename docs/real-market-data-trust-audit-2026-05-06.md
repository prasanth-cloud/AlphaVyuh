# Real Market Data Trust Audit — 2026-05-06

This pass moves AlphaVyuh toward real-market EOD usage without enabling gated broker execution or paid realtime feeds.

## Current Data Paths

| Surface | Source | Freshness | Cache | Failure mode | Launch risk | Fix in this pass |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard market overview | `daily_ohlcv` latest complete date plus Kite websocket index snapshot when available | EOD trade date, with live index beta if connected | Backend 60s TTL, frontend snapshot cache | Fail-soft overview shell | Index quote fallback could look like realtime | Added source metadata and data-health provider context |
| Scanner | `daily_ohlcv` latest complete date, joined to `stock_universe` | EOD trade date | DB push filters, frontend run state | Empty unavailable response | Coverage/source was not explicit in API | Added mode/source/coverage/universe metadata |
| Watchlist quotes | `daily_ohlcv` latest complete date for all watchlist symbols | EOD trade date | Frontend request coalescing; backend one batched quote query | Shell returns without enrichment | Header called backend data “live configured” | Renamed UX to EOD market or demo fixtures; backend returns metadata |
| Watchlist fundamentals | Lazy yfinance/fundamental route | Provider-specific, may be unavailable | Lazy per selected symbol | Skeleton/fallback, desk remains usable | Fundamentals may be stale or missing | Existing lazy/fail-soft behavior retained |
| Inline chart candles | `/api/v1/charts/{symbol}/candles` from `daily_ohlcv` | Latest candle timestamp | Frontend candle cache per symbol/timeframe/query | Error/empty chart fallback in UI | Source/mode absent from response | Added candle source metadata |
| Full chart candles/indicators | Same candle endpoint plus indicators computed from displayed EOD set | Latest candle timestamp | Client cache keyed by symbol/timeframe/query | No-data error state | Demo/EOD provenance looked identical | Added response metadata and demo badges |
| Data status page | `data_health` view plus Kite status | Latest ingest run and latest trade date | Client 60s cache | Unknown state | Operator view lacked bhavcopy run detail | Added provider, fallback, last successful EOD, bhavcopy run fields |

## Provider Strategy

- Reliable default: NSE EOD bhavcopy into `daily_ohlcv`.
- Optional live-beta paths remain disabled unless configured: Kite REST/WS, licensed providers later.
- Mock mode is now shown as `Demo`, not `Fallback`, so testers cannot confuse local fixtures with real EOD data.
- Paid/commercial data remains future work; no redistribution-sensitive realtime feed was enabled.

## EOD Ingest Hardening

- Weekend targets are skipped before download.
- Small NSE archive responses are treated as likely holiday/unpublished instead of failed market data.
- Bhavcopy log now supports source URL, expected rows, coverage %, partial ingest flag, warnings, attempts, and completion time.
- Writes remain idempotent through upserts; successful dates are not re-ingested unless the prior run was partial/failed/skipped.

## Remaining Owner Input

- Production Supabase migration application requires owner approval.
- Real Kite/Upstox read-only smoke requires owner-provided tokens.
- Any paid realtime provider requires contract/license choice before implementation.
