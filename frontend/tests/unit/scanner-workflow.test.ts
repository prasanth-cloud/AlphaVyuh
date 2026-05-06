import { describe, expect, it } from "vitest";
import { scannerWatchlistPatches, scannerWorkflowPatch, selectedScannerSymbols } from "@/lib/scanner-workflow";

describe("scanner workflow helpers", () => {
  it("maps shortlist, ignored, and review-later row actions into workflow patches", () => {
    expect(scannerWorkflowPatch("tcs", "shortlist")).toMatchObject({
      symbol: "TCS",
      lifecycle: "idea",
      source: "scanner",
    });

    expect(scannerWorkflowPatch("infy", "ignored")).toMatchObject({
      symbol: "INFY",
      lifecycle: "ignored",
      source: "scanner",
      ignored: true,
      review_later: false,
    });

    expect(scannerWorkflowPatch("aubank", "review_later")).toMatchObject({
      symbol: "AUBANK",
      lifecycle: "review_later",
      source: "scanner",
      review_later: true,
      ignored: false,
    });
  });

  it("creates watchlist workflow patches from scanner results", () => {
    expect(scannerWatchlistPatches(["reliance", "DIXON"], "wl-1")).toEqual([
      {
        symbol: "RELIANCE",
        watchlist_id: "wl-1",
        lifecycle: "watch",
        source: "scanner",
        ignored: false,
        review_later: false,
      },
      {
        symbol: "DIXON",
        watchlist_id: "wl-1",
        lifecycle: "watch",
        source: "scanner",
        ignored: false,
        review_later: false,
      },
    ]);
  });

  it("preserves result order when deriving selected scanner symbols", () => {
    const results = [{ symbol: "TCS" }, { symbol: "INFY" }, { symbol: "RELIANCE" }];
    expect(selectedScannerSymbols(results, new Set(["RELIANCE", "TCS"]))).toEqual(["TCS", "RELIANCE"]);
  });
});
