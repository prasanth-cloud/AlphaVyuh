import { describe, expect, it } from "vitest";
import {
  buildMultiChartDecisionPatch,
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
});
