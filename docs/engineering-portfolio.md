# AlphaVyuh engineering portfolio

Evidence updated: 2026-10-15. The public signup entry and restored API are
deployed; real email confirmation and signed-in production coverage remain
unverified. See the [release-specific evidence](analytics-recovery-verification.md).
This demonstration plan distinguishes measured results from proposed acceptance
criteria.

## Engineering narrative

AlphaVyuh's portfolio story is a traceable journey from a recorded plan to a
closed trade, correct statistics, and process review. Follow
[ADR 013](decisions/013-product-wedge.md): journal and review are the product
wedge; scanner work remains limited to fixes and performance unless a new ADR
establishes the stated revisit conditions.

The October 13 research snapshot of the employer's [Head of Engineering vacancy](https://wellfound.com/jobs/4629917-head-of-engineering)
emphasized Python, PostgreSQL/ETL, reliability, review, and prioritization. It
required 8+ years of engineering and 2+ years of leadership, managing 3–5 developers.
AlphaVyuh can demonstrate relevant judgment; it does not establish qualifications,
location eligibility, or endorsement. Recheck availability and eligibility before
applying.

The [official Minervini Markets 360 page](https://www.minervini.com/) advertises
portfolio risk, trading analytics, and post-analysis alongside charting and
screening. This establishes a relevant problem domain, not proprietary-method
equivalence or evaluation by its team.

## Workbook evidence and scope

Targeted review used the owner's supplied **2025 Master Trader Program,
Superperformance Workshop, Volume 2 of 2**, filename
`Course workbook volume 2 (1).pdf`, by Mark Minervini with co-instructor Mark
Ritchie II. These pages were rendered and visually checked; the entire 253-page
PDF was not reviewed:

| Printed / PDF page | Original product implication |
| --- | --- |
| 445 / 129 | Keep candidate stages and a repeatable preparation/review routine. |
| 458 / 142 | Stop distance alone does not capture sizing, liquidity, volatility, or event exposure. |
| 470 / 154 | Evaluate average gains/losses together with outcome frequencies. |
| 487, 491 / 171, 175 | Exposure decisions require evidence from results and portfolio pressure. |
| 519–520 / 203–204 | Relate position allocation and stop distance to total-equity risk. |
| 537 / 221 | Grade entry and exit decisions separately from profit or loss. |

These original summaries treat course examples as contextual, not universal
defaults. No excerpts, page images, or workbook assets belong in the repository.

## Demonstration: one trade, fully traceable

Use labeled synthetic records without broker order submission:

1. Record symbol, exchange, data source/as-of time, setup, thesis, invalidation,
   entry, initial stop, quantity, and planned reward/risk.
2. Close the hypothetical trade; compare plan and outcome, explaining denominators
   and missing values.
3. Review entry timing and exit adherence independently of whether money was made.
4. Repeat with missing risk, unavailable data, failed saves, and expired sessions;
   preserve drafts and provide recovery.
5. Open the focused regression tests and reviewed diff. Label local, mocked,
   preview, and production evidence explicitly.

The [drawdown regressions](../backend/tests/test_journal_drawdown.py) cover rising
P&L, ongoing drawdowns, and unavailable percentage drawdown without account equity.
The [trade-outcome regressions](../frontend/tests/e2e/journal.spec.ts) demonstrate
that a losing trade with planned reward/risk of 3 cannot display `+3.00R`.
These describe realized journal records, not complete mark-to-market returns.

## Ranked product priorities and acceptance

| Priority | Change | Measurable acceptance |
| --- | --- | --- |
| P0 | Statistics and missing data | Explicit expected results for rising, initial-loss, recovery, ongoing-loss, empty, and malformed-date fixtures. Show contributing counts; unknown denominators stay null. Verify completeness beyond API page limits. Provider failures show recovery, never false empty history or synthetic live data. |
| P1 | Immutable initial risk and realized R | Snapshot execution basis, quantity, initial stop, timestamp, and provenance. Later stop edits cannot change initial risk. Separate planned reward/risk from realized P&L/initial risk. Test long/short, partial exits, fees, missing/zero risk, and invalid numbers. Imported risk without evidence remains unknown. |
| P1 | Process grading | Record entry timing, exit adherence, evidence, and review timestamp independently of P&L. Test a disciplined loser and undisciplined winner. Distinguish unreviewed from unavailable evidence; trace edits and reconcile review counts. |
| P1 | Equity-aware planning | Hypothetical equity 100,000, entry 100, stop 96, and budget 1,000 yields 250 shares, 25,000 notional, and 1% planned risk before costs. Apply user concentration/buying-power caps. Missing equity blocks percentage claims; disclose missing stops and gap/slippage exposure. |
| P2 | Performance evidence | Benchmark 100, 1,000, and 10,000 synthetic trades in a fixed environment; record query count, response bytes, p50/p95 latency, and memory before/after. Agree budgets before optimization; publish measured results. |

Remaining gaps are visible in [journal models](../backend/app/routers/journal.py)
and [dashboard risk inputs](../frontend/lib/dashboard-risk-control.ts): mutable
stops and open-trade counts cannot establish initial risk or portfolio stop-risk.
The [trade table](../frontend/app/(app)/journal/components/TradeTable.tsx) now shows
recorded percentage returns or unavailable R instead of inventing realized R.
Initial-risk snapshots and structured grades still require implementation.

## TradingView and market-data boundaries

TradingView states that it has [no public API for market data or indicator values](https://www.tradingview.com/support/solutions/43000474413-i-need-access-to-your-api-in-order-to-get-data-or-indicator-values/);
its REST API serves broker integration. Its [charting library requires a separate data source](https://tradingview.com/charting-library-docs/latest/connecting_data/).
Use providers with appropriate data rights; record exchange, currency, as-of time,
session, and adjustments. A chart library is not a market-data entitlement.

A narrow interoperability option is a user-directed watchlist TXT export with
comma-separated `EXCHANGE:TICKER` symbols, following [TradingView's documented format](https://www.tradingview.com/support/solutions/43000487233-how-to-import-or-export-a-watchlist/).
Validate mappings and report unresolved symbols. This transfers symbols, not
quotes or proprietary signals. Preserve applicable chart-library
notices and [Lightweight Charts attribution](https://tradingview.github.io/lightweight-charts/docs/5.1/api/interfaces/LayoutOptions#attributionlogo).

## Evidence to attach before sharing

Attach the reviewed PR, commit, test results, environment/data mode, screenshots,
and blockers. Describe actual contributions. Restrict recovery, scale, security,
and trading-performance claims to release-specific evidence. Posting and recruiter
contact require separate authorization.
