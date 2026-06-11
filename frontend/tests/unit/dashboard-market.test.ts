import { describe, expect, it } from "vitest";
import {
  MAJOR_SECTOR_DEFINITIONS,
  filterMajorSectorBreadth,
  isMarketOverviewReady,
  resolveEmaBreadthView,
  resolveHighsLowsView,
} from "@/lib/dashboard-market";
import type { MarketOverview } from "@/lib/api/types";

const sampleOverview: MarketOverview = {
  trade_date: "2026-06-10",
  advances: 1200,
  declines: 800,
  unchanged: 97,
  total: 2097,
  advance_decline_ratio: 1.5,
  new_52w_highs: 42,
  new_52w_lows: 18,
  above_ema20_pct: 62,
  above_ema50_pct: 54,
  above_ema200_pct: 48,
  market_phase: "Bullish",
  market_phase_desc: "Constructive breadth",
  sector_breadth: [
    { sector: "IT Services", total: 10, advances: 7, declines: 3, avg_pct_change: 1.2, breadth_pct: 70 },
    { sector: "Banks", total: 8, advances: 4, declines: 4, avg_pct_change: 0.1, breadth_pct: 50 },
    { sector: "Textiles", total: 4, advances: 1, declines: 3, avg_pct_change: -0.4, breadth_pct: 25 },
  ],
  top_gainers: [],
  top_losers: [],
  most_active: [],
};

describe("dashboard-market helpers", () => {
  it("filters to eleven major sectors and drops minor labels", () => {
    expect(MAJOR_SECTOR_DEFINITIONS).toHaveLength(11);
    const cells = filterMajorSectorBreadth(sampleOverview.sector_breadth);
    expect(cells).toHaveLength(11);
    expect(cells.find((cell) => cell.label === "IT")?.sector?.sector).toBe("IT Services");
    expect(cells.find((cell) => cell.label === "Financial Services")?.sector?.sector).toBe("Banks");
    expect(cells.every((cell) => cell.sector?.sector !== "Textiles")).toBe(true);
  });

  it("treats missing trade date or market errors as unavailable", () => {
    expect(isMarketOverviewReady(sampleOverview, "")).toBe(true);
    expect(isMarketOverviewReady({ ...sampleOverview, trade_date: null }, "")).toBe(false);
    expect(isMarketOverviewReady(sampleOverview, "Market overview is temporarily unavailable.")).toBe(false);
  });

  it("returns daily highs and lows but not weekly history", () => {
    expect(resolveHighsLowsView("daily", sampleOverview)).toEqual({
      status: "ready",
      data: { highs: 42, lows: 18 },
    });
    expect(resolveHighsLowsView("weekly", sampleOverview).status).toBe("unavailable");
  });

  it("returns day EMA breadth only for the latest session", () => {
    expect(resolveEmaBreadthView("day", sampleOverview)).toEqual({
      status: "ready",
      data: { ema20: 62, ema50: 54, ema200: 48 },
    });
    expect(resolveEmaBreadthView("week", sampleOverview).status).toBe("unavailable");
    expect(resolveEmaBreadthView("month", sampleOverview).status).toBe("unavailable");
    expect(resolveEmaBreadthView("year", sampleOverview).status).toBe("unavailable");
  });
});
