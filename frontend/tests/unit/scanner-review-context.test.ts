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
      data_source: "NSE bhavcopy",
      data_mode: "eod",
      data_as_of: "2026-05-29",
    })).toEqual({
      pills: ["Trend Template", "A 84", "As of 2026-05-29", "Source: NSE bhavcopy · EOD"],
      primaryReason: "Price above SMA stack",
      warnings: ["Partial universe coverage"],
      sourceLabel: "Source: NSE bhavcopy · EOD",
    });
  });

  it("falls back quietly when scanner context is missing", () => {
    expect(scannerReviewContextSummary(null)).toEqual({
      pills: [],
      primaryReason: null,
      warnings: [],
      sourceLabel: null,
    });
  });
});
