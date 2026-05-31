import { describe, expect, it } from "vitest";
import { buildScannerMatchExplanation } from "@/lib/scanner-match-explanation";

describe("scanner match explanation", () => {
  it("connects triggered conditions to latest values and data trust", () => {
    const explanation = buildScannerMatchExplanation({
      close: 1321.2,
      pct_change: -2.17,
      volume_ratio: 2.76,
      rsi_14: 37.25,
      ema_50: 1376.1,
      ema_200: 1416,
      atr_pct: 2.2,
      week_52_high_pct: 8.4,
      rs_score: 82,
      sector: "Energy",
      match_reasons: ["RS score 82", "Volume 2.8x 20-day average"],
      confidence_reasons: ["above-average volume"],
      setup_score: 83,
      setup_grade: "A",
      confidence_label: "High confidence",
    }, {
      presetName: "Trend Template",
      tradeDate: "2026-05-29",
      currentDate: new Date("2026-05-31T12:00:00Z"),
      scanTrust: {
        source: "NSE bhavcopy",
        mode: "eod",
        asOf: "2026-05-29",
        coveragePct: 97.7,
      },
    });

    expect(explanation.headline).toBe("RS score 82");
    expect(explanation.reasons).toEqual(["RS score 82", "Volume 2.8x 20-day average"]);
    expect(explanation.confirmations).toEqual(["above-average volume"]);
    expect(explanation.context).toEqual([
      { label: "Scan", value: "Trend Template" },
      { label: "Sector", value: "Energy" },
      { label: "Source", value: "NSE bhavcopy · EOD" },
      { label: "As of", value: "2026-05-29" },
      { label: "Freshness", value: "2 days old" },
      { label: "Coverage", value: "97.7%" },
    ]);
    expect(explanation.warnings).toEqual([]);
    expect(explanation.metrics).toEqual(expect.arrayContaining([
      { label: "Last price", value: "₹1,321.2 (-2.17%)", tone: "bad" },
      { label: "Volume", value: "2.76x 20D avg", tone: "good" },
      { label: "RS score", value: "82", tone: "good" },
      { label: "Freshness", value: "2 days old", tone: "good" },
      { label: "Setup quality", value: "High confidence · A · 83", tone: "good" },
    ]));
    expect(explanation.nextAction).toBe("Open chart and plan risk");
  });

  it("falls back to active filters and chart confirmation when reason detail is missing", () => {
    const explanation = buildScannerMatchExplanation({
      close: 100,
      match_reasons: [],
      confidence_reasons: [],
      data_warnings: ["Partial universe coverage"],
    }, {
      tradeDate: "2026-05-29",
      currentDate: new Date("2026-05-31T12:00:00Z"),
    });

    expect(explanation.headline).toBe("Matched the active scanner filters");
    expect(explanation.reasons).toEqual(["Matched the active scanner filters"]);
    expect(explanation.confirmations).toEqual(["Needs chart confirmation"]);
    expect(explanation.warnings).toEqual(["Partial universe coverage"]);
    expect(explanation.context).toEqual([
      { label: "As of", value: "2026-05-29" },
      { label: "Freshness", value: "2 days old" },
    ]);
    expect(explanation.nextAction).toBe("Check data before planning");
  });

  it("warns when the scan session is stale", () => {
    const explanation = buildScannerMatchExplanation({
      close: 100,
      setup_score: 82,
      match_reasons: ["Close above EMA50"],
    }, {
      tradeDate: "2026-05-20",
      currentDate: new Date("2026-05-31T12:00:00Z"),
      scanTrust: {
        source: "NSE bhavcopy",
        mode: "eod",
        asOf: "2026-05-20",
      },
    });

    expect(explanation.context).toEqual(expect.arrayContaining([
      { label: "As of", value: "2026-05-20" },
      { label: "Freshness", value: "11 days old" },
    ]));
    expect(explanation.metrics).toEqual(expect.arrayContaining([
      { label: "Freshness", value: "11 days old", tone: "bad" },
    ]));
    expect(explanation.warnings).toEqual(["Market data is 11 days old; refresh data before planning."]);
    expect(explanation.nextAction).toBe("Check data before planning");
  });

  it("treats degraded or missing trust metadata as a planning blocker", () => {
    const degraded = buildScannerMatchExplanation({
      close: 100,
      setup_score: 82,
    }, {
      currentDate: new Date("2026-05-31T12:00:00Z"),
      scanTrust: {
        source: "Recovery cache",
        mode: "recovery",
        asOf: "2026-05-31",
      },
    });

    const missing = buildScannerMatchExplanation({
      close: 100,
      setup_score: 82,
    }, {
      currentDate: new Date("2026-05-31T12:00:00Z"),
    });

    expect(degraded.context).toEqual(expect.arrayContaining([
      { label: "Source", value: "Recovery cache · RECOVERY" },
      { label: "Freshness", value: "Degraded" },
    ]));
    expect(degraded.warnings).toEqual([
      "Scanner is using degraded market data; confirm freshness before planning.",
    ]);
    expect(degraded.nextAction).toBe("Check data before planning");

    expect(missing.context).toEqual([{ label: "Freshness", value: "Unknown" }]);
    expect(missing.warnings).toEqual([
      "No market session timestamp is available; check Data Status before planning.",
    ]);
    expect(missing.nextAction).toBe("Check data before planning");
  });
});
