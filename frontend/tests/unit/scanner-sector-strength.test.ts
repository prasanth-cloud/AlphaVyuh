import { describe, expect, it } from "vitest";
import { buildScannerSectorStrength } from "@/lib/scanner-sector-strength";

describe("scanner sector strength", () => {
  it("ranks sectors by setup, RS, price, volume, and 52-week context", () => {
    const sectors = buildScannerSectorStrength([
      {
        symbol: "RELIANCE",
        sector: "Energy",
        setup_score: 88,
        rs_score: 84,
        pct_change: 2.2,
        volume_ratio: 2.1,
        week_52_high_pct: 5,
      },
      {
        symbol: "ONGC",
        sector: "Energy",
        setup_score: 82,
        rs_score: 78,
        pct_change: 1.1,
        volume_ratio: 1.6,
        week_52_high_pct: 8,
      },
      {
        symbol: "TCS",
        sector: "Information Technology",
        setup_score: 55,
        rs_score: 44,
        pct_change: -1.2,
        volume_ratio: 0.9,
        week_52_high_pct: 24,
      },
    ]);

    expect(sectors[0]).toMatchObject({
      sector: "Energy",
      activeCount: 2,
      nearHighCount: 2,
      label: "Leader",
      topSymbols: ["RELIANCE", "ONGC"],
    });
    expect(sectors[0]?.reason).toContain("RS 81");
    expect(sectors[1]).toMatchObject({
      sector: "Information Technology",
      activeCount: 1,
    });
  });

  it("keeps unmapped sector rows visible and penalizes data warnings", () => {
    const sectors = buildScannerSectorStrength([
      {
        symbol: "IPO1",
        sector: "",
        pct_change: 4,
        volume_ratio: 2.5,
        data_warnings: ["Sector missing"],
      },
      {
        symbol: "IPO2",
        sector: null,
        pct_change: 3,
        volume_ratio: 2,
      },
    ]);

    expect(sectors).toHaveLength(1);
    expect(sectors[0]).toMatchObject({
      sector: "Unmapped sector",
      activeCount: 2,
      warningCount: 1,
    });
    expect(sectors[0]?.reason).toContain("data warning");
  });
});
