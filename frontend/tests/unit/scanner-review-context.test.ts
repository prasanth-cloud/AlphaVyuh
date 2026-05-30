import { describe, expect, it } from "vitest";
import { scannerReviewContextSummary } from "@/lib/scanner-review-context";

describe("scanner review context", () => {
  it("builds setup-review pills from scanner source, date, and setup context", () => {
    expect(scannerReviewContextSummary({
      source: "scanner",
      preset_name: "Trend Template",
      match_reasons: ["Price above SMA stack"],
      data_warnings: ["Partial universe coverage"],
      setup_score: 84,
      setup_grade: "A",
      rs_score: 91,
      price_perf_6m_pct: 24.6,
      week_52_high_pct: 3.4,
      volume_ratio: 1.87,
      rsi_14: 63.2,
      data_source: "NSE bhavcopy",
      data_mode: "eod",
      data_as_of: "2026-05-29",
    })).toEqual({
      pills: ["Trend Template", "A 84", "As of 2026-05-29", "Source: NSE bhavcopy · EOD"],
      metrics: [
        { label: "RS", value: "91" },
        { label: "6M", value: "+24.6%" },
        { label: "52W high", value: "3.4% away" },
        { label: "Volume", value: "1.87x" },
        { label: "RSI", value: "63.2" },
      ],
      primaryReason: "Price above SMA stack",
      warnings: ["Partial universe coverage"],
      sourceLabel: "Source: NSE bhavcopy · EOD",
    });
  });

  it("falls back quietly when scanner context is missing", () => {
    expect(scannerReviewContextSummary(null)).toEqual({
      pills: [],
      metrics: [],
      primaryReason: null,
      warnings: [],
      sourceLabel: null,
    });
  });
});
