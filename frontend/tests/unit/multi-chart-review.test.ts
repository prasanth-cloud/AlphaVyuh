import { describe, expect, it } from "vitest";
import {
  buildMultiChartReviewHref,
  normalizeMultiChartSymbols,
  tradingViewNseSymbols,
} from "@/lib/multi-chart-review";

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

  it("formats TradingView-compatible NSE symbols", () => {
    expect(tradingViewNseSymbols(["RELIANCE", "NSE:INFY"])).toBe("NSE:RELIANCE,NSE:INFY");
  });
});
