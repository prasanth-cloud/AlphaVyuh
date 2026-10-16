import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJournalAnalytics } from "@/lib/journal-analytics";
import { mockJournalAnalytics, mockJournalEntries, mockJournalStats } from "@/lib/mock-data";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } } }) } }),
}));

const legacy = {
  equity_curve: [{ date: "2026-05-01", cumulative_pnl: 100 }],
  setup_breakdown: [{ setup: "Breakout", trades: 1, wins: 1, win_rate: 100, total_pnl: 100, avg_pnl: 100 }],
  monthly_pnl: [{ month: "2026-05", pnl: 100 }],
  drawdown_curve: [{ date: "2026-05-01", drawdown: 0, drawdown_pct: null }],
  max_drawdown: 0,
  longest_dd_days: 0,
  recovery_factor: null,
  profit_factor: null,
};

const metrics = {
  closed_trades: 100, eligible_trades: 100, return_trade_count: 100, cash_trade_count: 100,
  wins: 46, losses: 54, breakevens: 0, win_rate_pct: 46, loss_rate_pct: 54,
  avg_gain_pct: 14, avg_loss_pct: 7, largest_gain_pct: 14, largest_loss_pct: 7,
  avg_win_cash: 140, avg_loss_cash: 700, expectancy_pct: 2.66, expectancy_cash: -313.6,
  payoff_ratio: 2, adjusted_win_loss_ratio: 1.7037, avg_winner_holding_days: 7,
  avg_loser_holding_days: 2, winner_holding_count: 46, loser_holding_count: 54,
};

describe("journal analytics response boundary", () => {
  it("keeps demo journal headline statistics consistent with its trade list", () => {
    const entries = mockJournalEntries().entries;
    const stats = mockJournalStats();
    const closed = entries.filter(entry => entry.status === "closed");
    expect(stats.total_trades).toBe(closed.length);
    expect(stats.open_trades).toBe(entries.length - closed.length);
    expect(stats.total_pnl).toBe(closed.reduce((sum, entry) => sum + (entry.pnl ?? 0), 0));
  });
  it("validates the labeled demo fixture and keeps mutations independent", () => {
    const example = mockJournalAnalytics();
    const parsed = parseJournalAnalytics(example);
    expect(parsed.trading_edge?.closed_trades).toBe(95);
    expect(parsed.trade_distribution?.returns_pct).toHaveLength(95);
    expect(parsed.monthly_tracker?.reduce((sum, month) => sum + month.closed_trades, 0)).toBe(95);
    example.equity_curve.length = 0;
    expect(mockJournalAnalytics().equity_curve.length).toBeGreaterThan(0);
  });
  it("preserves valid legacy fields while new analytics remain explicitly unknown", () => {
    const parsed = parseJournalAnalytics(legacy);
    expect(parsed.equity_curve).toEqual(legacy.equity_curve);
    expect(parsed.trading_edge).toBeNull();
    expect(parsed.monthly_tracker).toBeUndefined();
    expect(parsed.trade_distribution).toBeNull();
    expect(parsed.metric_coverage).toBeNull();
  });

  it("parses the percentage trade metrics and numeric distribution", () => {
    const parsed = parseJournalAnalytics({
      ...legacy,
      trading_edge: metrics,
      monthly_tracker: [{ month: "2026-05", ...metrics }],
      trade_distribution: { returns_pct: [14, -7, 0], gain_count: 1, loss_count: 1, breakeven_count: 1, missing_return_count: 2 },
      metric_coverage: { closed_trades: 5, eligible_trades: 5, return_trade_count: 3, cash_trade_count: 5, unknown_exit_date_count: 0, future_exit_date_count: 0, missing_return_count: 2, missing_cash_pnl_count: 0 },
      unknown_future_field: "ignored",
    });
    expect(parsed.trading_edge?.expectancy_pct).toBe(2.66);
    expect(parsed.monthly_tracker?.[0].avg_loss_pct).toBe(7);
    expect(parsed.trade_distribution?.returns_pct).toEqual([14, -7, 0]);
    expect(parsed.metric_coverage?.missing_return_count).toBe(2);
  });

  it.each([
    null, [], {}, { ...legacy, equity_curve: null },
    { ...legacy, monthly_pnl: [{ month: "2026-05", pnl: "100" }] },
    { ...legacy, max_drawdown: Infinity },
    { ...legacy, trading_edge: { ...metrics, avg_loss_pct: NaN } },
    { ...legacy, trading_edge: { ...metrics, return_trade_count: -1 } },
    { ...legacy, trading_edge: { ...metrics, wins: 999 } },
    { ...legacy, trading_edge: { ...metrics, win_rate_pct: 101 } },
    { ...legacy, monthly_tracker: [{ ...metrics, month: "2026-99" }] },
    { ...legacy, trade_distribution: { returns_pct: [14, null], gain_count: 1, loss_count: 0, breakeven_count: 1, missing_return_count: 0 } },
    { ...legacy, metric_coverage: { closed_trades: "100" } },
  ])("rejects malformed known data instead of synthesizing zero analytics: %j", (payload) => {
    expect(() => parseJournalAnalytics(payload)).toThrow("Journal analytics are temporarily unavailable.");
  });
});

describe("journal analytics API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FORCE_LIVE_DATA", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects malformed successful HTTP responses at the real API boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...legacy, drawdown_curve: null }))));
    const { getJournalAnalytics } = await import("@/lib/api");

    await expect(getJournalAnalytics()).rejects.toThrow("Journal analytics are temporarily unavailable.");
  });

  it("does not cache a malformed response as a successful empty journal", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...legacy, equity_curve: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacy)));
    vi.stubGlobal("fetch", fetchMock);
    const { getJournalAnalytics } = await import("@/lib/api");

    await expect(getJournalAnalytics()).rejects.toThrow();
    await expect(getJournalAnalytics()).resolves.toMatchObject({ equity_curve: legacy.equity_curve, trading_edge: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
