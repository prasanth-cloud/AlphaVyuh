import { describe, expect, it } from "vitest";
import {
  buildMultiChartAnalysisSummary,
  buildMultiChartDecisionPatch,
  buildMultiChartReviewHref,
  normalizeMultiChartSymbols,
  tradingViewNseSymbols,
} from "@/lib/multi-chart-review";
import type { CandleBar, CandlesResponse } from "@/lib/api";

function candlesFrom(start: string, count: number, closeAt: (index: number) => number): CandleBar[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    const close = closeAt(index);
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + index,
      ema_20: close - 3,
      ema_50: close - 6,
      ema_200: close - 12,
    };
  });
}

function candleResponse(overrides: Partial<CandlesResponse> = {}): CandlesResponse {
  const candles = candlesFrom("2025-01-01", 420, (index) => 100 + index * 0.25);
  const last = candles.at(-1)!;
  return {
    symbol: "RELIANCE",
    company_name: "Reliance Industries",
    sector: "Energy",
    timeframe: "D",
    candles,
    latest: {
      close: last.close,
      pct_change: 1.2,
      volume: last.volume,
      volume_ratio: 1.8,
      rsi_14: 62.4,
      ema_20: last.ema_20 ?? null,
      ema_50: last.ema_50 ?? null,
      ema_200: last.ema_200 ?? null,
      atr_14: 12,
      week_52_high: last.close * 1.05,
      week_52_low: last.close * 0.72,
      open: last.open,
      high: last.high,
      low: last.low,
      prev_close: last.close - 1,
    },
    ...overrides,
  };
}

describe("multi-chart review helpers", () => {
  it("normalizes, deduplicates, and caps chart review symbols", () => {
    expect(normalizeMultiChartSymbols("nse:reliance, INFY tcs INFY hdfcbank icicibank")).toEqual([
      "RELIANCE",
      "INFY",
      "TCS",
      "HDFCBANK",
    ]);
  });

  it("builds a chart review href with watchlist provenance", () => {
    expect(buildMultiChartReviewHref(["RELIANCE", "INFY"], {
      source: "watchlist",
      watchlistId: "wl-1",
      watchlistName: "Rotation queue",
    })).toBe("/charts?symbols=RELIANCE%2CINFY&from=watchlist&watchlistId=wl-1&watchlist=Rotation+queue");
  });

  it("keeps board URLs limited to the first four visible queue symbols", () => {
    expect(buildMultiChartReviewHref(["RELIANCE", "INFY", "TCS", "HDFCBANK", "ICICIBANK"], {
      source: "watchlist",
      watchlistName: "Filtered desk",
    })).toBe("/charts?symbols=RELIANCE%2CINFY%2CTCS%2CHDFCBANK&from=watchlist&watchlist=Filtered+desk");
  });

  it("formats TradingView-compatible NSE symbols", () => {
    expect(tradingViewNseSymbols(["RELIANCE", "NSE:INFY"])).toBe("NSE:RELIANCE,NSE:INFY");
  });

  it("builds board decision patches without losing existing tags", () => {
    expect(buildMultiChartDecisionPatch("nse:reliance", "ready", {
      source: "scanner",
      existingTags: ["scan-vcp"],
    })).toMatchObject({
      symbol: "RELIANCE",
      lifecycle: "ready",
      source: "scanner",
      watchlist_id: null,
      ignored: false,
      review_later: false,
      tags: ["scan-vcp", "multi-chart-ready"],
    });

    expect(buildMultiChartDecisionPatch("INFY", "invalidated", {
      source: "watchlist",
      watchlistId: "wl-1",
    })).toMatchObject({
      symbol: "INFY",
      lifecycle: "invalidated",
      source: "watchlist",
      watchlist_id: "wl-1",
      ignored: true,
      review_later: false,
      tags: ["multi-chart-invalidated"],
    });
  });

  it("summarizes launch-grade multi-chart analysis context", () => {
    const summary = buildMultiChartAnalysisSummary(candleResponse(), {
      source: "scanner",
      rs_score: 86,
      week_52_high_pct: 5,
      volume_ratio: 1.8,
    });

    expect(summary).toMatchObject({
      playbookStatus: "ready",
      playbookDetail: "Weekly/monthly aligned",
    });
    expect(summary?.metrics).toEqual(expect.arrayContaining([
      { label: "RS", value: "86", tone: "good" },
      { label: "MA", value: "3/3 above", tone: "good" },
      { label: "Volume", value: "1.80x", tone: "good" },
    ]));
    expect(summary?.checklist.join(" ")).toContain("Weekly/monthly");
    expect(summary?.checklist.join(" ")).toContain("RS score: 86");
  });

  it("keeps RS pending when a board is opened without scanner context", () => {
    const summary = buildMultiChartAnalysisSummary(candleResponse(), null);

    expect(summary?.metrics).toEqual(expect.arrayContaining([
      { label: "RS", value: "Pending", tone: "muted" },
    ]));
    expect(summary?.checklist).toContain("RS score: pending scanner context");
  });
});
