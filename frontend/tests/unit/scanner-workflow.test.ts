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

  it("preserves scanner review context when a result moves into setup review", () => {
    const [patch] = scannerWatchlistPatches([
      {
        symbol: "RELIANCE",
        match_reasons: ["Price above SMA stack"],
        confidence_reasons: ["RS 80+"],
        data_warnings: ["Partial universe coverage"],
        setup_score: 84,
        setup_grade: "A",
        confidence_label: "High confidence",
        rs_score: 91,
        price_perf_6m_pct: 24.6,
        week_52_high_pct: 3.4,
        volume_ratio: 1.87,
        rsi_14: 63.2,
      },
    ], "wl-setup", {
      presetId: "trend_template",
      presetName: "Trend Template",
      tradeDate: "2026-05-29",
      dataSource: "NSE bhavcopy",
      dataMode: "eod",
      dataAsOf: "2026-05-29",
    });

    expect(patch).toMatchObject({
      symbol: "RELIANCE",
      watchlist_id: "wl-setup",
      lifecycle: "watch",
      source: "scanner",
      scanner_context: {
        source: "scanner",
        preset_id: "trend_template",
        preset_name: "Trend Template",
        match_reasons: ["Price above SMA stack"],
        confidence_reasons: ["RS 80+"],
        data_warnings: ["Partial universe coverage"],
        setup_score: 84,
        setup_grade: "A",
        confidence_label: "High confidence",
        rs_score: 91,
        price_perf_6m_pct: 24.6,
        week_52_high_pct: 3.4,
        volume_ratio: 1.87,
        rsi_14: 63.2,
        scan_trade_date: "2026-05-29",
        data_source: "NSE bhavcopy",
        data_mode: "eod",
        data_as_of: "2026-05-29",
      },
    });
    expect(patch.scanner_context?.captured_at).toEqual(expect.any(String));
  });

  it("preserves result order when deriving selected scanner symbols", () => {
    const results = [{ symbol: "TCS" }, { symbol: "INFY" }, { symbol: "RELIANCE" }];
    expect(selectedScannerSymbols(results, new Set(["RELIANCE", "TCS"]))).toEqual(["TCS", "RELIANCE"]);
  });
});
