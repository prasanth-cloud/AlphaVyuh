import { describe, expect, it } from "vitest";
import type { JournalAnalytics, JournalStats } from "@/lib/api";
import { buildDashboardRiskControl } from "@/lib/dashboard-risk-control";

const stats: JournalStats = {
  total_trades: 12,
  open_trades: 1,
  total_pnl: 42_000,
  win_rate: 62,
  avg_pnl: 3_500,
  avg_win: 8_000,
  avg_loss: -3_500,
  best_trade: 16_000,
  worst_trade: -5_500,
  avg_holding_days: 7,
};

const analytics: JournalAnalytics = {
  equity_curve: [
    { date: "2026-04", cumulative_pnl: 20_000 },
    { date: "2026-05", cumulative_pnl: 42_000 },
  ],
  setup_breakdown: [],
  monthly_pnl: [{ month: "May", pnl: 22_000 }],
  drawdown_curve: [{ date: "2026-05", drawdown: -2_400, drawdown_pct: -4.2 }],
  max_drawdown: -5_000,
  longest_dd_days: 4,
  recovery_factor: 8.4,
  profit_factor: 2.2,
};

describe("buildDashboardRiskControl", () => {
  it("puts data and account issues ahead of trading readiness", () => {
    const risk = buildDashboardRiskControl({
      stats,
      analytics,
      closedTrades: 12,
      reviewedTrades: 12,
      openTrades: 0,
      marketDataStatus: "stale",
      accountIssueCount: 1,
      alertIssueCount: 0,
      brokerConnected: true,
    });

    expect(risk.status).toBe("warn");
    expect(risk.primaryAction.id).toBe("data");
    expect(risk.guardrails[0]?.href).toBe("/data");
  });

  it("shows an empty state until closed-trade risk analytics exist", () => {
    const risk = buildDashboardRiskControl({
      stats: { ...stats, total_trades: 0, open_trades: 2, total_pnl: 0, win_rate: 0 },
      analytics: null,
      closedTrades: 0,
      reviewedTrades: 0,
      openTrades: 2,
      marketDataStatus: "healthy",
      accountIssueCount: 0,
      alertIssueCount: 0,
      brokerConnected: false,
    });

    expect(risk.status).toBe("empty");
    expect(risk.headline).toBe("Build a risk sample");
    expect(risk.metrics.find((metric) => metric.label === "Review coverage")?.value).toBe("—");
  });

  it("raises review and edge guardrails before adding size", () => {
    const risk = buildDashboardRiskControl({
      stats: { ...stats, win_rate: 38, avg_win: 2_500, avg_loss: -3_000 },
      analytics: { ...analytics, profit_factor: 1.1, recovery_factor: 1.2 },
      closedTrades: 10,
      reviewedTrades: 6,
      openTrades: 2,
      marketDataStatus: "healthy",
      accountIssueCount: 0,
      alertIssueCount: 0,
      brokerConnected: true,
    });

    expect(risk.status).toBe("action");
    expect(risk.guardrails.map((item) => item.id)).toEqual(expect.arrayContaining(["review", "edge", "loss"]));
    expect(risk.metrics.find((metric) => metric.label === "Payoff ratio")?.tone).toBe("action");
  });

  it("uses known review debt when full journal coverage is partial", () => {
    const risk = buildDashboardRiskControl({
      stats,
      analytics,
      closedTrades: 24,
      reviewedTrades: 24,
      knownUnreviewedTrades: 0,
      reviewCoveragePartial: true,
      openTrades: 0,
      marketDataStatus: "healthy",
      accountIssueCount: 0,
      alertIssueCount: 0,
      brokerConnected: true,
    });

    expect(risk.guardrails.map((item) => item.id)).not.toContain("review");
    const coverage = risk.metrics.find((metric) => metric.label === "Review coverage");
    expect(coverage?.value).toBe("Recent clear");
    expect(coverage?.detail).toMatch(/loaded journal sample/i);
  });

  it("marks risk stable when edge, drawdown, and review coverage are healthy", () => {
    const risk = buildDashboardRiskControl({
      stats,
      analytics,
      closedTrades: 12,
      reviewedTrades: 12,
      openTrades: 0,
      marketDataStatus: "healthy",
      accountIssueCount: 0,
      alertIssueCount: 0,
      brokerConnected: true,
    });

    expect(risk.status).toBe("ready");
    expect(risk.score).toBeGreaterThanOrEqual(80);
    expect(risk.primaryAction.id).toBe("ready");
    expect(risk.metrics.find((metric) => metric.label === "Profit factor")?.value).toBe("2.20");
  });
});
