import { describe, expect, it } from "vitest";
import type { AiPatterns, JournalAnalytics, JournalStats } from "@/lib/api/types";
import { buildDashboardPerformanceCoach } from "@/lib/dashboard-performance-coach";

const stats: JournalStats = {
  total_trades: 24,
  open_trades: 1,
  total_pnl: 68_400,
  win_rate: 62.5,
  avg_pnl: 2_850,
  avg_win: 8_000,
  avg_loss: -3_500,
  best_trade: 16_000,
  worst_trade: -5_500,
  avg_holding_days: 7,
};

const analytics: JournalAnalytics = {
  equity_curve: [],
  setup_breakdown: [
    { setup: "Breakout", trades: 10, wins: 7, win_rate: 70, total_pnl: 38_200, avg_pnl: 3_820 },
    { setup: "Pullback", trades: 8, wins: 5, win_rate: 63, total_pnl: 24_600, avg_pnl: 3_075 },
  ],
  monthly_pnl: [],
  drawdown_curve: [],
  max_drawdown: -5_500,
  longest_dd_days: 4,
  recovery_factor: 4.8,
  profit_factor: 2.1,
};

const patterns: AiPatterns = {
  ready: true,
  total_trades: 24,
  trades_available: 24,
  min_trades_required: 10,
  avg_hold_winners: 8,
  avg_hold_losers: 4,
  coaching_cards: [
    { label: "Repeated mistakes", value: "3 noted", detail: "Late entries after range extension are hurting average R:R.", tone: "warn" },
    { label: "Best setup type", value: "Breakout", detail: "12 trades, 67% win rate, +₹58,400 P&L.", tone: "gain" },
    { label: "Risk/reward discipline", value: "Avg 2.1:1", detail: "2 closed trades were below 2:1 planned R:R.", tone: "warn" },
  ],
  by_direction: [
    { direction: "long", trades: 18, wins: 12, win_rate: 66.7, total_pnl: 58_400 },
    { direction: "short", trades: 6, wins: 3, win_rate: 50, total_pnl: 10_020 },
  ],
};

const baseInput = {
  stats,
  analytics,
  patterns,
  closedTrades: 24,
  reviewedTrades: 24,
  knownUnreviewedTrades: 0,
  reviewCoveragePartial: false,
  journalIssueCount: 0,
  brokerConnected: true,
};

describe("buildDashboardPerformanceCoach", () => {
  it("surfaces ready AI coaching with an active process leak", () => {
    const coach = buildDashboardPerformanceCoach(baseInput);

    expect(coach.tone).toBe("action");
    expect(coach.headline).toMatch(/improvement/i);
    expect(coach.primaryAction).toMatchObject({
      id: "coach",
      tone: "action",
      href: "/journal?tab=analytics",
    });
    expect(coach.items.find((item) => item.id === "leak")).toMatchObject({
      value: "3 noted",
      tone: "action",
    });
    expect(coach.insights).toHaveLength(3);
  });

  it("gates coaching when journal analytics are unavailable", () => {
    const coach = buildDashboardPerformanceCoach({
      ...baseInput,
      stats: null,
      analytics: null,
      patterns: null,
      journalIssueCount: 1,
    });

    expect(coach.tone).toBe("warn");
    expect(coach.primaryAction).toMatchObject({
      id: "coach",
      value: "Unavailable",
      href: "/data",
      tone: "warn",
    });
  });

  it("shows an empty coaching sample before closed trades exist", () => {
    const coach = buildDashboardPerformanceCoach({
      ...baseInput,
      stats: null,
      analytics: null,
      patterns: null,
      closedTrades: 0,
      reviewedTrades: 0,
      brokerConnected: false,
    });

    expect(coach.tone).toBe("empty");
    expect(coach.primaryAction).toMatchObject({
      id: "coach",
      value: "No sample",
      href: "/settings/broker",
    });
  });

  it("uses sample readiness when AI patterns need more reviewed trades", () => {
    const coach = buildDashboardPerformanceCoach({
      ...baseInput,
      patterns: {
        ready: false,
        trades_available: 4,
        min_trades_required: 10,
      },
      closedTrades: 4,
      reviewedTrades: 4,
    });

    expect(coach.tone).toBe("action");
    expect(coach.items.find((item) => item.id === "coach")).toMatchObject({
      value: "4/10",
      href: "/journal",
      tone: "action",
    });
  });

  it("falls back to setup analytics when AI gain cards are absent", () => {
    const coach = buildDashboardPerformanceCoach({
      ...baseInput,
      patterns: { ready: true, coaching_cards: [] },
    });

    expect(coach.items.find((item) => item.id === "edge")).toMatchObject({
      value: "Breakout",
      tone: "ready",
    });
  });

  it("turns review debt into a coaching insight when AI cards are not ready", () => {
    const coach = buildDashboardPerformanceCoach({
      ...baseInput,
      patterns: null,
      closedTrades: 8,
      reviewedTrades: 5,
      knownUnreviewedTrades: 3,
      reviewCoveragePartial: true,
    });

    expect(coach.tone).toBe("action");
    expect(coach.insights[0]).toMatchObject({
      label: "Review backlog",
      value: "3 due",
      tone: "action",
    });
  });
});
