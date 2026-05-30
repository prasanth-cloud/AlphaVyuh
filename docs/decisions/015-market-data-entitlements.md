# ADR 015 - Market Data Entitlements And Launch Contract

**Status:** Proposed / owner-gated  
**Date:** 2026-05-30  
**Author:** Product and agent team  
**Scope:** Market-data sources, chart-history claims, broker data boundaries, TradingView/ChartsMaze parity research, and launch gates for #294, #285, #286, #287, and #42.

---

## Context

AlphaVyuh is moving toward a public launch for Indian equity traders. The platform must not claim NSE sector accuracy, five-year chart coverage, live data, broker execution, or TradingView-grade charts unless the underlying source, entitlement, and verification gate support that claim.

The current product direction is:

- Use official NSE EOD data first for daily/weekly/monthly charting, scanning, and breadth.
- Treat sector taxonomy as unverified until audited against NSE references.
- Make five years of daily OHLCV mandatory for established NSE EQ symbols.
- Keep broker integrations read-only until profile, holdings, orderbook, tradebook, and status checks pass.
- Keep order placement as an explicit future gate; no live or sandbox orders without owner approval.
- Keep TradingView Advanced Charts blocked until business/licensing approval in #42.

Public competitor research did not reveal ChartsMaze's exact data vendor or broker execution implementation. Their visible product strength is workflow packaging: scanner, analytics, watchlists, chart review, journal, multi-chart, and pricing. AlphaVyuh should compete by making data trust visible instead of copying unknown internals.

## Decision

AlphaVyuh will treat market data as a launch contract with explicit source, entitlement, and verification metadata.

Market-data claims are allowed only when all three are true:

1. **Source is named.** The UI and data-health surfaces expose the provider/source family, as-of date, and whether the data is audited.
2. **Entitlement is documented.** The source is permitted for the use case: internal validation, user-scoped broker data, EOD analytics, or redistributed platform charts.
3. **Coverage is enforced.** Production checks fail when launch-critical symbols, sectors, or broker read-only paths do not meet the contract.

Until a paid/vendor contract is approved, AlphaVyuh must launch as an EOD-first product. It must not market itself as realtime or exchange-live.

## Provider Matrix

| Source | Intended use | Launch posture | Notes |
| --- | --- | --- | --- |
| NSE official/free EOD bhavcopy | Daily OHLCV, scanner, breadth, watchlists, five-year daily charts | Launch baseline | Best low-cost foundation for EOD swing-trading analytics. Needs sector taxonomy audit, corporate-action checks, alias handling, and coverage smoke gates. |
| `daily_ohlcv` database | Internal canonical EOD store | Launch baseline after audit | Must carry as-of and source metadata. Five-year daily span is mandatory for established NSE EQ symbols; IPOs/renames need limited-history labels. |
| Zerodha Kite Connect | User-scoped broker profile, holdings, orderbook, tradebook, optional user-authorized historical/live data | Read-only first | Zerodha's public API page and support docs describe historical candles and realtime WebSocket streaming under the paid Connect plan at INR 500/month per API key. Treat this as user/broker entitlement, not platform-wide redistributed market data, unless terms confirm. |
| DhanHQ Data API | Candidate data provider and user/broker integration | Evaluation only | Dhan support documents the Data API subscription at INR 499 plus taxes/month. Terms, coverage, redistribution, and production reliability must be verified before launch claims. |
| TrueData / GlobalDatafeeds / exchange data vendors | Paid realtime or commercial market-data feed | Owner-gated | Use only after pricing, redistribution rights, SLAs, and contract terms are approved. |
| Yahoo/yfinance | Local validation, fallback experiments, historical comparison | Not a launch trust source | Useful for development and spot checks; do not use as the public source of truth for Indian-market launch claims. |
| TradingView Advanced Charts | Charting UI library only | Blocked by #42 | TradingView documentation says Advanced Charts needs AlphaVyuh to provide its own datafeed; it is not a bundled data vendor. Licensing/paywall confirmation remains required before implementation. |

## Launch Contracts

### Sector Accuracy

- Sector data is **unverified** until audited against NSE sector, industry, and sector-index references.
- Sector endpoints and UI must expose source, as-of date, active symbol count, aliases, unmapped symbols, and hidden/filter policy.
- Hidden sector filtering, such as excluding sectors with fewer than three active stocks, must either be removed or clearly explained in the response metadata and UI.
- Hardcoded sector-index labels must align with audited NSE terminology or be marked as product-defined aliases.

### Five-Year Daily Charts

- Established NSE EQ symbols must have at least five years of daily OHLCV coverage before the product can claim launch-ready chart history.
- The contract applies to daily candles. Weekly/monthly/max views can summarize daily data, but they must not falsely satisfy the daily five-year contract.
- IPOs, recently listed companies, and renamed symbols should show a limited-history label instead of an error or silent short chart.
- Production smoke checks must fail when core symbols do not meet the five-year daily span.

### Chart Analysis Workflow

- The scanner -> watchlist -> chart path must preserve review context: why the symbol was selected, weekly/monthly trend context, RS, 52-week levels, moving averages, volume context, notes, drawings, and source badges.
- Multi-chart review should support `1Y`, `3Y`, `5Y`, and `Max` ranges.
- Drawing and note persistence must remain source-aware, so users can trust what data snapshot they reviewed.

### Broker Data And Orders

- Broker integrations are read-only until the smoke suite verifies OAuth/callback, profile, holdings, positions, orderbook, tradebook/import, and broker status.
- Buy/sell buttons are order intent only until live orders are explicitly approved.
- Backend order submission stays gated by `BROKER_LIVE_ORDERS_ENABLED=false`.
- Broker account data is user-scoped and must not be repurposed as redistributed platform market data without written approval.

## Non-Goals

- No live orders in this ADR.
- No claim that TradingView provides AlphaVyuh's market data.
- No launch claim of realtime charts.
- No implementation of TradingView Advanced Charts until #42 has owner-approved licensing confirmation.
- No dependency on ChartsMaze's undisclosed internals.

## Acceptance Gates

- #285 sector taxonomy endpoint and UI expose source/as-of/counts/aliases/unmapped/filter policy.
- #286 five-year daily candle smoke fails for missing coverage on core established NSE EQ symbols.
- #287 broker read-only smoke appears in settings/data-health and blocks order enablement.
- #42 records TradingView licensing approval or remains blocked.
- #294 records the chosen market-data provider plan before any public realtime/live-data claim.
- Mission Control lists any owner-gated secrets, contracts, or production smoke credentials that prevent launch verification.

## References

- TradingView Advanced Charts FAQ: https://www.tradingview.com/charting-library-docs/latest/getting_started/Frequently-Asked-Questions/
- TradingView Advanced Charts quick start: https://www.tradingview.com/charting-library-docs/latest/getting_started/quick-start
- Zerodha Kite Connect product page: https://zerodha.com/products/api/
- Zerodha support on historical/live data pricing: https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/historical-data-and-live-market-data-payment-plan
- DhanHQ Data API subscription support page: https://dhan.co/support/platforms/dhanhq-api/how-does-the-dhanhq-data-api-subscription-work/
- AlphaVyuh ADR 009: `docs/decisions/009-chart-library.md`
