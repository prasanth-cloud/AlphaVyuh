import { describe, expect, it } from "vitest";
import { getMarketPanelEmptyCopy } from "@/lib/data-health-copy";

describe("getMarketPanelEmptyCopy", () => {
  it("warns when market summary failed instead of implying an empty session", () => {
    const copy = getMarketPanelEmptyCopy({
      panel: "sector-breadth",
      dataHealth: { status: "healthy", latest_trade_date: "2026-06-08", hours_since_refresh: 1, symbols_on_latest_date: 3000, universe_active: 3400, indicators_missing: { rsi_14: 0, ema_200: 0 }, last_run: { id: "run-1", errors: 0 } },
      marketError: "Market summary is temporarily unavailable.",
      hasSessionDate: false,
    });

    expect(copy.tone).toBe("warn");
    expect(copy.testId).toBe("dashboard-sector-breadth-unavailable");
    expect(copy.message).toContain("temporarily unavailable");
  });

  it("warns on degraded ingest before showing neutral empty copy", () => {
    const copy = getMarketPanelEmptyCopy({
      panel: "movers",
      dataHealth: { status: "degraded", latest_trade_date: "2026-06-08", hours_since_refresh: 8, symbols_on_latest_date: 2800, universe_active: 3400, indicators_missing: { rsi_14: 120, ema_200: 40 }, last_run: { id: "run-2", errors: 2 } },
      hasSessionDate: true,
    });

    expect(copy.tone).toBe("warn");
    expect(copy.testId).toBe("dashboard-movers-degraded");
    expect(copy.message).toContain("degraded");
  });

  it("uses neutral copy only when health is healthy and a session date exists", () => {
    const copy = getMarketPanelEmptyCopy({
      panel: "movers",
      dataHealth: { status: "healthy", latest_trade_date: "2026-06-08", hours_since_refresh: 1, symbols_on_latest_date: 3000, universe_active: 3400, indicators_missing: { rsi_14: 0, ema_200: 0 }, last_run: { id: "run-3", errors: 0 } },
      hasSessionDate: true,
    });

    expect(copy.tone).toBe("neutral");
    expect(copy.testId).toBeUndefined();
    expect(copy.message).toContain("No top movers returned");
  });
});
