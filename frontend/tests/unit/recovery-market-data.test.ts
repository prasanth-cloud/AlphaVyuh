import { describe, expect, it } from "vitest";
import { applyRecoveryDbFilters, rowMatchesFilters } from "@/lib/server/recovery-market-data";

type MockQuery = {
  calls: string[];
  gte(column: string, value: number | string): MockQuery;
  lte(column: string, value: number | string): MockQuery;
  gt(column: string, value: number | string): MockQuery;
  lt(column: string, value: number | string): MockQuery;
  eq(column: string, value: boolean | number | string): MockQuery;
  in(column: string, values: string[]): MockQuery;
};

function createMockQuery(): MockQuery {
  const query: MockQuery = {
    calls: [],
    gte(column, value) {
      query.calls.push(`gte:${column}:${value}`);
      return query;
    },
    lte(column, value) {
      query.calls.push(`lte:${column}:${value}`);
      return query;
    },
    gt(column, value) {
      query.calls.push(`gt:${column}:${value}`);
      return query;
    },
    lt(column, value) {
      query.calls.push(`lt:${column}:${value}`);
      return query;
    },
    eq(column, value) {
      query.calls.push(`eq:${column}:${value}`);
      return query;
    },
    in(column, values) {
      query.calls.push(`in:${column}:${values.join(",")}`);
      return query;
    },
  };
  return query;
}

describe("applyRecoveryDbFilters", () => {
  it("pushes scalar scanner filters to the query", () => {
    const query = createMockQuery();
    applyRecoveryDbFilters(query, {
      price_min: 100,
      price_max: 5000,
      rsi_min: 50,
      rs_score_min: 70,
      volume_ratio_min: 1.5,
      week_52_high_pct_max: 10,
      w52l_pct_min: 30,
      avg_volume_50d_min: 100000,
      price_perf_6m_min: 20,
      ema_200_trending_up: true,
      series: ["EQ"],
    });

    expect(query.calls).toEqual([
      "gte:close:100",
      "lte:close:5000",
      "gte:rsi_14:50",
      "gte:volume_ratio:1.5",
      "gte:rs_score:70",
      "lte:w52h_pct:10",
      "gte:w52l_pct:30",
      "gte:avg_volume_50d:100000",
      "gte:price_perf_6m_pct:20",
      "gt:ema_200_slope_30d:0",
      "in:stock_universe.series:EQ",
    ]);
  });
});

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
