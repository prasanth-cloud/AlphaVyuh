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
      { label: "Coverage", value: "97.7%" },
    ]);
    expect(explanation.metrics).toEqual(expect.arrayContaining([
      { label: "Last price", value: "₹1,321.2 (-2.17%)", tone: "bad" },
      { label: "Volume", value: "2.76x 20D avg", tone: "good" },
      { label: "RS score", value: "82", tone: "good" },
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
    });

    expect(explanation.headline).toBe("Matched the active scanner filters");
    expect(explanation.reasons).toEqual(["Matched the active scanner filters"]);
    expect(explanation.confirmations).toEqual(["Needs chart confirmation"]);
    expect(explanation.warnings).toEqual(["Partial universe coverage"]);
    expect(explanation.context).toEqual([{ label: "As of", value: "2026-05-29" }]);
    expect(explanation.nextAction).toBe("Check data before planning");
  });
});
