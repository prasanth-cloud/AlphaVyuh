import { describe, expect, it } from "vitest";
import {
  buildDashboardEquitySnapshot,
  CHART_TIMEFRAME_PILL_OPTIONS,
  formatDashboardPnl,
} from "@/lib/dashboard-equity";

describe("buildDashboardEquitySnapshot", () => {
  it("returns unavailable when journal stats cannot load", () => {
    const snapshot = buildDashboardEquitySnapshot({
      unavailable: true,
      unavailableMessage: "Journal stats are temporarily unavailable.",
      stats: null,
      analytics: null,
      closedTrades: 0,
    });
    expect(snapshot.status).toBe("unavailable");
    if (snapshot.status === "unavailable") {
      expect(snapshot.message).toMatch(/temporarily unavailable/i);
    }
  });

  it("returns honest empty state when there are no closed trades", () => {
    const snapshot = buildDashboardEquitySnapshot({
      stats: {
        total_trades: 2,
        open_trades: 2,
        total_pnl: 0,
        win_rate: 0,
        avg_pnl: 0,
        avg_win: 0,
        avg_loss: 0,
        best_trade: 0,
        worst_trade: 0,
        avg_holding_days: 0,
      },
      analytics: null,
      closedTrades: 0,
      openTrades: 2,
    });
    expect(snapshot.status).toBe("empty");
    if (snapshot.status === "empty") {
      expect(snapshot.openTrades).toBe(2);
    }
  });

  it("builds ready snapshot from stats and analytics", () => {
    const snapshot = buildDashboardEquitySnapshot({
      stats: {
        total_trades: 5,
        open_trades: 1,
        total_pnl: 12000,
        win_rate: 60,
        avg_pnl: 2400,
        avg_win: 5000,
        avg_loss: -2000,
        best_trade: 8000,
        worst_trade: -3000,
        avg_holding_days: 6,
      },
      analytics: {
        equity_curve: [
          { date: "2026-01", cumulative_pnl: 4000 },
          { date: "2026-02", cumulative_pnl: 12000 },
        ],
        setup_breakdown: [],
        monthly_pnl: [{ month: "Feb", pnl: 8000 }],
        drawdown_curve: [],
        max_drawdown: null,
        longest_dd_days: 0,
        recovery_factor: null,
        profit_factor: null,
      },
      closedTrades: 4,
    });
    expect(snapshot.status).toBe("ready");
    if (snapshot.status === "ready") {
      expect(snapshot.totalPnl).toBe(12000);
      expect(snapshot.equityCurve).toHaveLength(2);
      expect(snapshot.monthlyPnl[0]?.month).toBe("Feb");
    }
  });
});

describe("formatDashboardPnl", () => {
  it("formats signed INR amounts", () => {
    expect(formatDashboardPnl(1500)).toBe("+₹1,500");
    expect(formatDashboardPnl(-900)).toBe("-₹900");
  });
});

describe("CHART_TIMEFRAME_PILL_OPTIONS", () => {
  it("matches supported historical chart ranges", () => {
    expect(CHART_TIMEFRAME_PILL_OPTIONS).toEqual([
      "1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "Max",
    ]);
  });
});
