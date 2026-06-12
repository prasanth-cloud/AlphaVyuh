import { describe, expect, it } from "vitest";
import {
  formatScannerColumnValue,
  SCANNER_DEFAULT_COLUMN_IDS,
  resolveScannerColumns,
} from "@/lib/scanner-result-columns";
import type { ScanResult } from "@/lib/api/types";

const sampleRow: ScanResult = {
  symbol: "RELIANCE",
  company_name: "Reliance Industries",
  series: "EQ",
  sector: "Energy",
  close: 2500,
  prev_close: 2480,
  open: 2490,
  high: 2510,
  low: 2485,
  pct_change: 0.8,
  gap_pct: null,
  volume: 1200000,
  avg_volume_20d: 1000000,
  volume_ratio: 1.2,
  turnover: null,
  rsi_14: 55,
  ema_20: 2480,
  ema_50: 2450,
  ema_200: 2400,
  ema_20_dist: null,
  ema_50_dist: null,
  week_52_high: 2600,
  week_52_low: 2000,
  week_52_high_pct: 4,
  week_52_low_pct: 25,
  atr_14: 40,
  atr_pct: 1.6,
  is_inside_bar: false,
  rs_score: 72,
  market_cap_cr: 1700000,
  pe_ratio: 28,
  pb_ratio: 2.1,
  eps: 90,
  dividend_yield: 0.4,
  roe: 12,
  roce: 11,
};

describe("scanner-result-columns", () => {
  it("keeps default columns in order", () => {
    const cols = resolveScannerColumns(SCANNER_DEFAULT_COLUMN_IDS);
    expect(cols.map((c) => c.id)).toEqual([
      "symbol",
      "company_name",
      "close",
      "pct_change",
      "rs_score",
      "week_52_high_pct",
      "sector",
      "volume",
    ]);
  });

  it("formats price and change columns", () => {
    expect(formatScannerColumnValue("close", sampleRow)).toContain("2,500");
    expect(formatScannerColumnValue("pct_change", sampleRow)).toBe("+0.8%");
    expect(formatScannerColumnValue("volume_ratio", sampleRow)).toBe("1.2×");
  });
});
