# Market Data Provider Decision Record

**Status:** Owner-gated  
**Last reviewed:** 2026-05-30  
**Related:** ADR 015, issues #42 and #294

This record turns the market-data entitlement ADR into an approval checklist. Do
not use a provider for public realtime claims, redistributed platform candles, or
paid launch copy until this file has an owner-approved decision and the linked
verification evidence.

## Current Launch Decision

| Use case | Approved launch source | Status |
| --- | --- | --- |
| Scanner, watchlist, alerts, EOD charts | Official/free NSE EOD pipeline stored in `daily_ohlcv` | Allowed after freshness and five-year coverage checks pass |
| Sector taxonomy | `stock_universe.sector` plus NSE reference metadata | Unverified until #285 audit gates pass |
| Broker profile, holdings, orderbook, tradebook import | User-authorized broker OAuth | Read-only/import-only; no order execution |
| Realtime or delayed platform feed | None | Blocked until owner signs vendor/exchange terms |
| TradingView Advanced Charts | None | Blocked until #42 confirms licensing and datafeed obligations |

## Owner Approval Fields

Complete these fields in the PR that changes the launch source.

| Field | Required evidence |
| --- | --- |
| Provider name and plan | Contract, quote, console screenshot, or signed approval note |
| Permitted use | EOD analytics, user-scoped broker data, internal validation, or redistributed platform display |
| Redistribution rights | Written terms covering authenticated SaaS users and any public previews |
| Exchange fees and renewals | Monthly cost, GST/taxes, exchange pass-through fees, renewal date, cancellation rules |
| Historical depth | Five years daily OHLCV for established NSE EQ symbols, with IPO/rename handling |
| Corporate actions | Split/bonus/dividend adjustment policy and whether raw/adjusted candles are both available |
| Freshness SLA | Expected delay, market holiday behavior, retry/backfill support, outage support channel |
| Rate limits | Per-minute/day limits and whether scanner/watchlist/chart use fits projected traffic |
| Data fields | OHLCV, volume, series, ISIN/symbol mapping, sector/industry metadata, indices, futures/options if included |
| Security boundary | Where credentials live, who can rotate them, and whether user broker tokens are separate |
| Verification gate | Production smoke command, sentinel symbols, and failure policy |

## Candidate Posture

| Candidate | Allowed next step | Not allowed yet |
| --- | --- | --- |
| NSE EOD pipeline | Improve ingest, coverage, sector audit, and five-year checks | Claim realtime/live exchange data |
| Zerodha Kite Connect | Read-only user account connect, holdings, orderbook, tradebook import, and user-scoped smoke | Reuse broker candles as AlphaVyuh's platform feed without written terms |
| DhanHQ Data API | Owner evaluation of terms, limits, historical depth, and redistribution | Public launch claim before contract evidence |
| TrueData / GlobalDatafeeds | Request commercial quotes and exchange-fee terms | Enable production mode before signed approval |
| TradingView Advanced Charts | Licensing discussion and UI prototype only after #42 approval | Treat as a data provider or broker execution product |
| ChartsMaze public behavior | Product workflow inspiration and competitor positioning | Infer their hidden data vendor, broker routing, or licensing model |

## Evidence Packet For A Provider PR

Every PR that changes `MARKET_DATA_PROVIDER`, public data copy, chart provider
behavior, or live/realtime claims must include:

1. Link to the owner-approved provider decision.
2. The exact launch use case and the exact use cases still blocked.
3. Before/after data badges or copy changes showing the source and as-of date.
4. Production smoke output for market summary, scanner, and five-year chart sentinels.
5. A rollback path that returns to EOD-only behavior without code edits.
6. Confirmation that broker account data is still user-scoped and read-only unless a separate order-execution approval exists.

## Current Blockers

- No signed vendor contract for redistributed platform realtime or delayed data.
- TradingView Advanced Charts remains blocked on #42 licensing confirmation.
- Broker data remains read-only/import-only and cannot become a platform candle feed without written broker/exchange approval.
- Production launch claims remain EOD-first until the provider decision fields above are complete.
