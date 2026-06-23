import { describe, expect, it } from "vitest";
import {
  countResultsMissingCoreFundamentals,
  displayCompanyName,
  symbolMissingCoreFundamentals,
} from "@/lib/company-display";
import { countActiveFiltersInSection } from "@/lib/scanner-filter-sections";
import { formatScannerColumnValue } from "@/lib/scanner-result-columns";

describe("displayCompanyName", () => {
  it("returns blank when company name repeats the ticker", () => {
    expect(displayCompanyName("SANSERA", "SANSERA")).toBe("");
    expect(displayCompanyName("NOCIL", "NOCIL Limited")).toBe("NOCIL Limited");
  });

  it("returns blank when company name is missing", () => {
    expect(displayCompanyName("WABAG", null)).toBe("");
  });
});

describe("formatScannerColumnValue company_name", () => {
  it("does not repeat ticker in the name column", () => {
    expect(formatScannerColumnValue("company_name", {
      symbol: "SANSERA",
      company_name: "SANSERA",
      close: 100,
      volume: 1_000_000,
    })).toBe("");
  });
});

describe("countActiveFiltersInSection", () => {
  it("counts active filters within a section", () => {
    const empty = { price_min: null, price_max: null, rsi_min: null };
    const active = { price_min: 100, price_max: null, rsi_min: 55 };
    expect(countActiveFiltersInSection(active, empty, ["price_min", "price_max"])).toBe(1);
    expect(countActiveFiltersInSection(active, empty, ["rsi_min"])).toBe(1);
  });
});

describe("symbolMissingCoreFundamentals", () => {
  it("flags rows with no core valuation ratios", () => {
    expect(symbolMissingCoreFundamentals({ pe_ratio: null, pb_ratio: null, roe: null, roce: null })).toBe(true);
    expect(symbolMissingCoreFundamentals({ pe_ratio: 12, pb_ratio: null, roe: null, roce: null })).toBe(false);
  });

  it("counts missing fundamentals across scan results", () => {
    expect(countResultsMissingCoreFundamentals([
      { pe_ratio: null, pb_ratio: null, roe: null, roce: null },
      { pe_ratio: 10, pb_ratio: 2, roe: 12, roce: 14 },
    ])).toBe(1);
  });
});
