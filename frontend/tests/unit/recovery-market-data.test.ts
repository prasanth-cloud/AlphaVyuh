import { describe, expect, it } from "vitest";
import { rowMatchesFilters } from "@/lib/server/recovery-market-data";

describe("rowMatchesFilters", () => {
  const baseRow = {
    symbol: "TEST",
    trade_date: "2026-06-05",
    open: 120,
    high: 125,
    low: 118,
    close: 124,
    prev_close: 120,
    volume: 2_000_000,
    avg_volume_20d: 1_000_000,
    avg_volume_50d: 900_000,
    rsi_14: 62,
    ema_20: 118,
    ema_50: 115,
    ema_150: 110,
    ema_200: 105,
    ema_200_slope_30d: 4.2,
    atr_14: 3.5,
    week_52_high: 130,
    week_52_low: 80,
    price_perf_6m_pct: 28,
    rs_score: 82,
    volume_ratio: 2,
    w52h_pct: 4.6,
    w52l_pct: 55,
    sma_50: 114,
    sma_150: 109,
    sma_200: 104,
    stock_universe: {
      symbol: "TEST",
      company_name: "Test Co",
      series: "EQ",
      sector: "Financials",
      is_active: true,
      market: "NSE",
      currency: "INR",
    },
  };

  it("matches trend-template style preset filters", () => {
    expect(rowMatchesFilters(baseRow, {
      all_smas_bullish: true,
      price_vs_sma50: "above",
      price_vs_sma150: "above",
      price_vs_sma200: "above",
      ema50_above_ema150: true,
      ema_200_trending_up: true,
      rsi_min: 50,
      rs_score_min: 70,
      week_52_high_pct_max: 25,
      w52l_pct_min: 30,
      series: ["EQ"],
    })).toBe(true);
  });

  it("rejects rows outside RS score max", () => {
    expect(rowMatchesFilters(baseRow, { rs_score_max: 80 })).toBe(false);
  });

  it("filters by sector instead of the legacy sectors key", () => {
    expect(rowMatchesFilters(baseRow, { sector: ["Financials"] })).toBe(true);
    expect(rowMatchesFilters(baseRow, { sector: ["Energy"] })).toBe(false);
    expect(rowMatchesFilters(baseRow, { sectors: ["Financials"] } as Record<string, unknown>)).toBe(true);
  });

  it("enforces avg volume, ATR pct, and 6M performance filters", () => {
    expect(rowMatchesFilters(baseRow, {
      avg_volume_50d_min: 100000,
      atr_pct_max: 8,
      price_perf_6m_min: 20,
    })).toBe(true);

    expect(rowMatchesFilters({ ...baseRow, avg_volume_50d: 50_000 }, {
      avg_volume_50d_min: 100000,
    })).toBe(false);
  });
});
