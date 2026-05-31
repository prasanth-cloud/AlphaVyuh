import { describe, expect, it } from "vitest";
import { composeScannerResults } from "@/lib/scanner-composition";

describe("scanner composition", () => {
  const trend = {
    screenId: "trend",
    screenName: "Trend Template",
    results: [
      { symbol: "TCS", setup_score: 82 },
      { symbol: "INFY", setup_score: 74 },
      { symbol: "TCS", setup_score: 82 },
    ],
  };

  const breakout = {
    screenId: "breakout",
    screenName: "VCP Breakout",
    results: [
      { symbol: "infy", setup_score: 71 },
      { symbol: "RELIANCE", setup_score: 68 },
    ],
  };

  it("keeps union order and annotates screen provenance for OR composition", () => {
    expect(composeScannerResults([trend, breakout], "or")).toEqual([
      { symbol: "TCS", setup_score: 82, screen_matches: ["Trend Template"] },
      { symbol: "INFY", setup_score: 74, screen_matches: ["Trend Template", "VCP Breakout"] },
      { symbol: "RELIANCE", setup_score: 68, screen_matches: ["VCP Breakout"] },
    ]);
  });

  it("keeps only symbols present in every selected screen for AND composition", () => {
    expect(composeScannerResults([trend, breakout], "and")).toEqual([
      { symbol: "INFY", setup_score: 74, screen_matches: ["Trend Template", "VCP Breakout"] },
    ]);
  });
});

