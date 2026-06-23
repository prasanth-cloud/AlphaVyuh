import { describe, expect, it } from "vitest";
import { buildDashboardJournalEdge } from "@/lib/dashboard-journal-edge";
import type { AiPatterns, JournalAnalytics, JournalEntry, JournalStats } from "@/lib/api/types";

function entry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: overrides.id ?? "j1",
    user_id: "user-1",
    symbol: overrides.symbol ?? "DIXON",
    company_name: null,
    trade_type: overrides.trade_type ?? "long",
    setup_type: overrides.setup_type ?? "Breakout",
    entry_date: "2026-06-10",
    entry_price: 100,
    quantity: 10,
    exit_date: overrides.exit_date ?? "2026-06-12",
    exit_price: overrides.exit_price ?? 112,
    pnl: overrides.pnl ?? 120,
    pnl_pct: overrides.pnl_pct ?? 12,
    holding_days: overrides.holding_days ?? 2,
    stop_loss: overrides.stop_loss ?? 95,
    target_price: overrides.target_price ?? 118,
    risk_reward: overrides.risk_reward ?? 2,
    entry_reason: overrides.entry_reason ?? "Breakout above base",
    exit_reason: overrides.exit_reason ?? "Target reached",
    mistakes: overrides.mistakes ?? "None",
    lessons: overrides.lessons ?? "Follow volume confirmation",
    status: overrides.status ?? "closed",
    source_page: overrides.source_page ?? "scanner",
    source_context: overrides.source_context ?? "Trend Template",
    scanner_context: null,
    thesis: overrides.thesis ?? "Leadership continuation",
    invalidation_rule: overrides.invalidation_rule ?? "Close below pivot",
    created_at: "2026-06-10T09:30:00Z",
    updated_at: "2026-06-12T15:30:00Z",
    ...overrides,
  };
}

const stats: JournalStats = {
  total_trades: 12,
  open_trades: 1,
  total_pnl: 42000,
  win_rate: 66,
  avg_pnl: 3500,
  avg_win: 7000,
  avg_loss: -2800,
  best_trade: 15000,
  worst_trade: -4200,
  avg_holding_days: 5,
};

const analytics: JournalAnalytics = {
  equity_curve: [],
  setup_breakdown: [
    { setup: "Breakout", trades: 8, wins: 6, win_rate: 75, total_pnl: 36000, avg_pnl: 4500 },
    { setup: "Pullback", trades: 4, wins: 2, win_rate: 50, total_pnl: 6000, avg_pnl: 1500 },
  ],
  monthly_pnl: [],
  drawdown_curve: [],
  max_drawdown: -4000,
  longest_dd_days: 4,
  recovery_factor: 4,
  profit_factor: 2.1,
};

const patterns: AiPatterns = {
  ready: true,
  total_trades: 12,
  trades_available: 12,
  min_trades_required: 10,
  coaching_cards: [{ label: "Hold winners", value: "Strong", detail: "Winners perform best when held past first pullback.", tone: "gain" }],
};

describe("buildDashboardJournalEdge", () => {
  it("marks a complete reviewed journal sample as ready", () => {
    const edge = buildDashboardJournalEdge({
      stats,
      analytics,
      patterns,
      journalEntries: [entry({}), entry({ id: "j2", symbol: "CAMS" })],
      accountIssueCount: 0,
      closedTrades: 2,
      reviewedTrades: 2,
      knownUnreviewedTrades: 0,
      reviewCoveragePartial: false,
      openTrades: 0,
      brokerConnected: true,
    });

    expect(edge.tone).toBe("ready");
    expect(edge.items.find((item) => item.id === "setup")?.value).toBe("Breakout");
    expect(edge.setups[0]).toMatchObject({ setup: "Breakout", tone: "ready" });
  });

  it("prioritizes journal data recovery when account data is unavailable", () => {
    const edge = buildDashboardJournalEdge({
      stats: null,
      analytics: null,
      patterns: null,
      journalEntries: [],
      accountIssueCount: 1,
      closedTrades: 0,
      reviewedTrades: 0,
      openTrades: 0,
      brokerConnected: false,
    });

    expect(edge.tone).toBe("warn");
    expect(edge.primaryAction).toMatchObject({
      id: "setup",
      href: "/data",
      tone: "warn",
    });
  });

  it("routes unreviewed closed trades to the review queue", () => {
    const edge = buildDashboardJournalEdge({
      stats,
      analytics,
      patterns,
      journalEntries: [entry({ lessons: null, mistakes: null })],
      accountIssueCount: 0,
      closedTrades: 4,
      reviewedTrades: 3,
      knownUnreviewedTrades: 1,
      reviewCoveragePartial: false,
      openTrades: 0,
      brokerConnected: true,
    });

    expect(edge.tone).toBe("action");
    expect(edge.primaryAction).toMatchObject({
      id: "review",
      href: "/journal?review=needs-review",
      tone: "action",
    });
  });

  it("flags open plans missing invalidation context", () => {
    const edge = buildDashboardJournalEdge({
      stats,
      analytics,
      patterns,
      journalEntries: [
        entry({ status: "open", exit_date: null, exit_price: null, pnl: null, pnl_pct: null, invalidation_rule: null }),
      ],
      accountIssueCount: 0,
      closedTrades: 8,
      reviewedTrades: 8,
      knownUnreviewedTrades: 0,
      openTrades: 1,
      brokerConnected: true,
    });

    const plan = edge.items.find((item) => item.id === "plan");
    expect(edge.tone).toBe("action");
    expect(plan).toMatchObject({
      value: "0/1",
      href: "/watchlist",
      tone: "action",
    });
  });

  it("treats missing trade history as an empty journal sample", () => {
    const edge = buildDashboardJournalEdge({
      stats: null,
      analytics: null,
      patterns: null,
      journalEntries: [],
      accountIssueCount: 0,
      closedTrades: 0,
      reviewedTrades: 0,
      openTrades: 0,
      brokerConnected: false,
    });

    expect(edge.tone).toBe("empty");
    expect(edge.headline).toMatch(/build/i);
    expect(edge.primaryAction.href).toBe("/journal");
  });
});
