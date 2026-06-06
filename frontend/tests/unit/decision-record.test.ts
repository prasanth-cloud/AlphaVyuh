import { describe, expect, it } from "vitest";
import { decisionRecordRows, scannerCapturedPriceLabel } from "@/lib/decision-record";

describe("decision record helpers", () => {
  it("summarizes scanner source, captured price, lifecycle, and journal state", () => {
    expect(decisionRecordRows({
      workflow: {
        symbol: "DIXON",
        source: "scanner",
        lifecycle: "review_later",
        review_later: true,
        scanner_context: {
          source: "scanner",
          preset_name: "Trend Template",
          match_reasons: ["Volume expansion near pivot"],
          data_as_of: "2026-05-29",
          captured_price: 14220,
          captured_change_pct: 3.18,
          captured_volume_ratio: 2.41,
        },
      },
      currentPrice: 14310,
      currentChangePct: 0.63,
      reviewState: { state: "needs-review" },
    })).toEqual([
      { label: "Source", value: "Scanner: Trend Template" },
      { label: "Reason", value: "Volume expansion near pivot" },
      { label: "Data as of", value: "2026-05-29" },
      { label: "Captured price", value: "Rs 14,220.00 · +3.18% · 2.41x volume" },
      { label: "Current price", value: "Rs 14,310.00 · +0.63%" },
      { label: "Status", value: "Review later" },
      { label: "Journal", value: "Closed trade needs review" },
    ]);
  });

  it("falls back for old workflow records without captured scanner price", () => {
    expect(scannerCapturedPriceLabel({ source: "scanner", preset_name: "Legacy scan" })).toBeNull();
    expect(decisionRecordRows({
      workflow: { symbol: "TCS", lifecycle: "watch", source: "watchlist" },
    })).toEqual([
      { label: "Source", value: "Watchlist" },
      { label: "Status", value: "Watch" },
      { label: "Journal", value: "No linked journal yet" },
    ]);
  });

  it("falls back for malformed workflow records without lifecycle", () => {
    expect(decisionRecordRows({
      workflow: { symbol: "INFY", source: "watchlist" } as never,
    })).toEqual([
      { label: "Source", value: "Watchlist" },
      { label: "Status", value: "Watch" },
      { label: "Journal", value: "No linked journal yet" },
    ]);
  });
});
