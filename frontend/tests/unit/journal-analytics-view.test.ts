import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JournalAnalytics } from "@/app/(app)/journal/components/JournalAnalytics";
import { buildReturnHistogram } from "@/app/(app)/journal/components/JournalPerformance";
import type { JournalTradeMetrics } from "@/lib/api/types";

const analytics = {
  equity_curve: [], setup_breakdown: [], monthly_pnl: [], drawdown_curve: [],
  max_drawdown: 0, longest_dd_days: 0, recovery_factor: null, profit_factor: null,
};

const metrics: JournalTradeMetrics = {
  closed_trades: 3, eligible_trades: 3, return_trade_count: 3, cash_trade_count: 3,
  wins: 2, losses: 1, breakevens: 0, win_rate_pct: 66.7, loss_rate_pct: 33.3,
  avg_gain_pct: 10, avg_loss_pct: 5, largest_gain_pct: 10, largest_loss_pct: 5,
  avg_win_cash: 1000, avg_loss_cash: 500, expectancy_pct: 5, expectancy_cash: 500,
  payoff_ratio: 2, adjusted_win_loss_ratio: 4, avg_winner_holding_days: 19,
  avg_loser_holding_days: 4, winner_holding_count: 2, loser_holding_count: 1,
};

describe("journal analytics tools", () => {
  it("keeps the assumption calculator available with an empty journal", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, { analytics }));

    expect(html).toContain("Result-based forecast");
    expect(html).toContain("Portfolio size");
    expect(html).toContain("Close some trades");
  });

  it("treats a pending analytics response as loading, not zero performance", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, { analytics: null }));

    expect(html).toContain("Loading journal analytics");
    expect(html).not.toContain("₹0");
  });

  it("keeps an unavailable journal distinct from an empty journal", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, {
      analytics: null, analyticsError: "Provider unavailable",
    }));

    expect(html).toContain("Provider unavailable");
    expect(html).not.toContain("Close some trades");
    expect(html).toContain("Result-based forecast");
  });

  it("renders historical metrics, all monthly columns, and the actual return histogram", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, { analytics: {
      ...analytics, trading_edge: metrics,
      monthly_tracker: [{ ...metrics, month: "2026-03" }],
      trade_distribution: { returns_pct: [10, 10, -5], gain_count: 2, loss_count: 1, breakeven_count: 0, missing_return_count: 0 },
    } }));

    for (const label of ["Trading edge", "Batting average", "Monthly tracker", "Largest gain", "Largest loss", "Held winners", "Held losers", "Trade-return distribution", "Summary ratios"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Return histogram for 3 trades");
    expect(html).toContain("2026-03");
    expect(html).toContain("66.7%");
  });

  it("does not synthesize new metrics from a legacy cash curve", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, { analytics: {
      ...analytics, equity_curve: [{ date: "2026-03-01", cumulative_pnl: 100 }],
    } }));

    expect(html).toContain("Trade-return metrics are unavailable");
    expect(html).toContain("Return distribution is unavailable");
    expect(html).not.toContain("0 wins");
  });

  it("explains excluded closed records even when none are eligible", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, { analytics: {
      ...analytics,
      metric_coverage: { closed_trades: 2, eligible_trades: 0, return_trade_count: 0,
        cash_trade_count: 0, unknown_exit_date_count: 0, future_exit_date_count: 2,
        missing_return_count: 0, missing_cash_pnl_count: 0 },
    } }));
    expect(html).toContain("0 of 2 closed records");
    expect(html).toContain("2 future dates");
    expect(html).not.toContain("Close some trades");
  });

  it("does not offer unavailable journal data as forecast assumptions", () => {
    const html = renderToStaticMarkup(createElement(JournalAnalytics, { analytics: {
      ...analytics, trading_edge: metrics,
    }, analyticsError: "Provider unavailable" }));

    expect(html).toContain("Result-based forecast");
    expect(html).not.toContain("Use journal averages");
  });
});

describe("return histogram", () => {
  it("counts boundary values exactly once, including the upper endpoint", () => {
    const buckets = buildReturnHistogram([-4, -2, 0, 2, 4]);
    expect(buckets.map(bucket => bucket.count)).toEqual([1, 1, 1, 2]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(5);
  });

  it("keeps flat, empty, and non-finite returns safe", () => {
    expect(buildReturnHistogram([0, 0])).toEqual([{ fromPct: 0, toPct: 2, count: 2 }]);
    expect(buildReturnHistogram([])).toEqual([]);
    expect(buildReturnHistogram([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([]);
    expect(buildReturnHistogram([-Number.MAX_VALUE, Number.MAX_VALUE])).toEqual([]);
  });

  it("limits visual bins without dropping observations", () => {
    const returns = Array.from({ length: 201 }, (_, index) => index - 100);
    const buckets = buildReturnHistogram(returns);
    expect(buckets.length).toBeLessThanOrEqual(24);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(returns.length);
  });
});
