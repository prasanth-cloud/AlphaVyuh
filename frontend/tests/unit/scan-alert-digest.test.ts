import { describe, expect, it } from "vitest";
import { buildScanAlertDigests } from "@/lib/scan-alert-digest";
import type { ScanAlertMatch } from "@/lib/api";

function match(runDate: string, symbols: string[]): ScanAlertMatch {
  return {
    id: `match-${runDate}`,
    alert_id: "alert-1",
    run_date: runDate,
    symbols: symbols.map((symbol, index) => ({
      symbol,
      close: 100 + index,
      pct_change: index,
      volume_ratio: 1 + index / 10,
      rsi_14: 55 + index,
    })),
    match_count: symbols.length,
    run_status: "success",
    error_message: null,
    scan_alerts: { name: "Trend Template" },
  };
}

describe("scan alert digest", () => {
  it("compares consecutive alert runs into entered, continuing, and exited groups", () => {
    const [latest] = buildScanAlertDigests([
      match("2026-05-30", ["RELIANCE", "TCS", "INFY"]),
      match("2026-05-31", ["RELIANCE", "AUBANK", "INFY"]),
    ]);

    expect(latest.current.run_date).toBe("2026-05-31");
    expect(latest.previous?.run_date).toBe("2026-05-30");
    expect(latest.entered.map((symbol) => symbol.symbol)).toEqual(["AUBANK"]);
    expect(latest.continuing.map((symbol) => symbol.symbol)).toEqual(["RELIANCE", "INFY"]);
    expect(latest.exited).toEqual(["TCS"]);
    expect(latest.summary).toBe("1 entered · 2 still matching · 1 exited");
  });

  it("describes the first tracked run when no previous match exists", () => {
    const [digest] = buildScanAlertDigests([match("2026-05-31", ["RELIANCE", "TCS"])]);

    expect(digest.previous).toBeNull();
    expect(digest.entered.map((symbol) => symbol.symbol)).toEqual(["RELIANCE", "TCS"]);
    expect(digest.continuing).toEqual([]);
    expect(digest.exited).toEqual([]);
    expect(digest.summary).toBe("2 current matches · first tracked run");
  });
});
