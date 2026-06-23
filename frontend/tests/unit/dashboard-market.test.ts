import { describe, expect, it } from "vitest";
import {
  MAJOR_SECTOR_DEFINITIONS,
  filterMajorSectorBreadth,
  isMarketOverviewReady,
  formatEmaBreadthTradeDate,
  resolveEmaBreadthLookbackRows,
  resolveHighsLowsView,
  moverCompanyLabel,
  visibleEmaBreadthLookbackOptions,
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
  ema_breadth_by_period: {
    day: { ema20: 62, ema50: 54, ema200: 48 },
    week: { ema20: 58, ema50: 51, ema200: 45 },
    month: null,
    year: null,
  },
  highs_lows_by_period: {
    daily: { highs: 42, lows: 18 },
    weekly: { highs: 180, lows: 95 },
  },
  market_phase: "Bullish",
  market_phase_desc: "Constructive breadth",
  sector_breadth_basis: "advancing_constituents",
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

  it("returns daily and weekly highs and lows when period buckets exist", () => {
    expect(resolveHighsLowsView("daily", sampleOverview)).toEqual({
      status: "ready",
      data: { highs: 42, lows: 18 },
    });
    expect(resolveHighsLowsView("weekly", sampleOverview)).toEqual({
      status: "ready",
      data: { highs: 180, lows: 95 },
    });
  });

  it("returns day lookback rows from lookback bucket or daily history fallback", () => {
    expect(resolveEmaBreadthLookbackRows("day", {
      ...sampleOverview,
      ema_breadth_lookback: {
        day: [
          { trade_date: "2026-06-10", ema20: 62, ema50: 54, ema200: 48 },
          { trade_date: "2026-06-09", ema20: 60, ema50: 52, ema200: 47 },
        ],
      },
    })).toHaveLength(2);
    expect(resolveEmaBreadthLookbackRows("day", {
      ...sampleOverview,
      ema_breadth_daily_history: [
        { trade_date: "2026-06-10", ema20: 62, ema50: 54, ema200: 48 },
      ],
    })).toHaveLength(1);
  });

  it("formats EMA breadth history dates with spaced day label", () => {
    expect(formatEmaBreadthTradeDate("2026-06-12")).toBe("12th Jun'26");
  });

  it("hides duplicate mover labels when company name matches symbol", () => {
    expect(moverCompanyLabel("NOCIL", "NOCIL")).toBeNull();
    expect(moverCompanyLabel("NOCIL", "NOCIL Limited")).toBe("NOCIL Limited");
  });

  it("hides year lookback until enough yearly history exists", () => {
    expect(visibleEmaBreadthLookbackOptions(sampleOverview).some((option) => option.id === "year")).toBe(false);
    expect(visibleEmaBreadthLookbackOptions({
      ...sampleOverview,
      ema_breadth_lookback: {
        year: [
          { trade_date: "2026-06-10", ema20: 62, ema50: 54, ema200: 48 },
          { trade_date: "2025-06-10", ema20: 58, ema50: 51, ema200: 45 },
        ],
      },
    }).some((option) => option.id === "year")).toBe(true);
  });
});
