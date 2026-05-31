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

## Public Research Findings - 2026-05-30

- **ChartsMaze:** Public pages show scanner templates, market analytics, sector/industry analytics, market breadth, watchlists, journal, and a premium plan at INR 499 + GST monthly, INR 2499 + GST semi-annually, and INR 3299 + GST annually. Their user guide describes exporting screened symbols to TradingView and importing/merging watchlists for TradingView review. It does **not** publicly identify an exchange data vendor, broker API provider, redistribution license, or direct broker order-routing implementation. Treat ChartsMaze as workflow/product inspiration, not as entitlement evidence.
- **TradingView Advanced Charts:** TradingView's library page separates hosted widgets, which include TradingView-hosted data, from libraries, which AlphaVyuh would self-host and connect to AlphaVyuh's own datafeed. The same page says Trading Platform is the product with direct trading functionality, while Advanced Charts is a charting library. Therefore, TradingView licensing can improve chart UX, but it does not buy NSE/BSE data rights, five-year candle coverage, or broker execution.
- **TradingView Broker Integration:** TradingView's broker manual separates data integration from trading integration. Trading requests go from the user's browser to the broker server, while market-data integration can be a separate server-to-server path and must pass strict data-quality requirements. AlphaVyuh should keep broker OAuth/read-only import, chart rendering, and platform market-data redistribution as separate gates.
- **Zerodha/Kite:** Zerodha's public support page says the free Personal API plan has no historical or realtime data, while the Connect plan includes realtime WebSocket data and historical candles at INR 500 per app per month for retail users. Zerodha also says Kite cannot directly connect third-party charting apps like TradingView; TradingView and ChartIQ libraries are used inside Kite. This supports AlphaVyuh's read-only broker posture: Kite data can be user-scoped broker/account data, not a default platform redistribution feed.
- **DhanHQ:** Dhan's public support page lists the Data API subscription at INR 499 plus taxes per month, recurring every 30 days. Treat this as candidate user/provider data only after terms, coverage, corporate-action behavior, rate limits, and redistribution rights are reviewed.
- **TrueData and GlobalDatafeeds:** Both publicly position themselves as authorised Indian market-data vendors with realtime and historical API coverage. GlobalDatafeeds states API pricing is tailored and asks commercial users to sign exchange agreements and pay required exchange fees. TrueData states redistribution/public display requires compliant permissions, and its pricing page says API subscriptions should be handled through the API path/ticket rather than the non-API product dropdown. Treat both as owner-gated vendor quote paths, not pre-approved launch sources.

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
- No claim that broker historical candles, quotes, or orderbook data can be reused as AlphaVyuh's platform-wide chart feed without broker, exchange, and vendor approval.
- No launch claim of realtime charts.
- No implementation of TradingView Advanced Charts until #42 has owner-approved licensing confirmation.
- No dependency on ChartsMaze's undisclosed internals.

## Acceptance Gates

- #285 sector taxonomy endpoint and UI expose source/as-of/counts/aliases/unmapped/filter policy.
- #286 five-year daily candle smoke fails for missing coverage on core established NSE EQ symbols.
- #287 broker read-only smoke appears in settings/data-health and blocks order enablement.
- #42 records TradingView licensing approval or remains blocked.
- #294 records the chosen market-data provider plan in `docs/market-data-provider-decision-record.md` before any public realtime/live-data claim.
- Mission Control lists any owner-gated secrets, contracts, or production smoke credentials that prevent launch verification.

## Provider Decision Record

The executable owner checklist lives in `docs/market-data-provider-decision-record.md`.
Any PR that changes `MARKET_DATA_PROVIDER`, public data copy, chart provider
behavior, or realtime/live claims must complete that record with:

- provider name and approved plan,
- permitted use case and explicitly blocked use cases,
- redistribution terms for authenticated SaaS usage,
- exchange fees, renewal terms, and cancellation rules,
- five-year historical coverage and corporate-action adjustment policy,
- rate limits, SLA, freshness behavior, and outage support,
- production smoke evidence and rollback path.

Until that record is complete, the platform remains EOD-first and owner-gated for
realtime, delayed, or redistributed vendor data.

## References

- TradingView Advanced Charts FAQ: https://www.tradingview.com/charting-library-docs/latest/getting_started/Frequently-Asked-Questions/
- TradingView free charting libraries FAQ: https://www.tradingview.com/free-charting-libraries/
- TradingView broker integration overview: https://www.tradingview.com/broker-api-docs/integration-overview/
- TradingView Advanced Charts quick start: https://www.tradingview.com/charting-library-docs/latest/getting_started/quick-start
- ChartsMaze user guide: https://chartsmaze.com/blogs/user-guide/
- ChartsMaze pricing page: https://chartsmaze.com/buy-premium-plan
- Zerodha Kite Connect product page: https://zerodha.com/products/api/
- Zerodha Kite API charges: https://support.zerodha.com/category/trading-and-markets/kite-web-and-mobile/kite-api/articles/what-are-the-charges-for-kite-apis
- Zerodha third-party charting apps support note: https://support.zerodha.com/category/trading-and-markets/charts-and-orders/charts/articles/third-party-charting-libraries
- Zerodha Trade From Charts announcement: https://zerodha.com/z-connect/featured/introducing-trade-from-charts-tfc-at-zerodha
- Zerodha support on historical/live data pricing: https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/historical-data-and-live-market-data-payment-plan
- DhanHQ Data API subscription support page: https://dhan.co/support/platforms/dhanhq-api/how-does-the-dhanhq-data-api-subscription-work/
- TrueData market data API: https://www.truedata.in/products/marketdataapi
- TrueData market data API compliance/pricing overview: https://www.truedata.in/market-data-apis
- TrueData pricing page: https://www.truedata.in/information/pricing
- GlobalDatafeeds API pricing page: https://globaldatafeeds.in/global-datafeeds-apis/global-datafeeds-apis/pricing-sales/api-pricing/
- GlobalDatafeeds who-can-purchase note: https://globaldatafeeds.in/global-datafeeds-apis/global-datafeeds-apis/pricing-sales/who-can-purchase/
- AlphaVyuh ADR 009: `docs/decisions/009-chart-library.md`
