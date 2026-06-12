import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/dashboard/MarketRegimeStrip.tsx", "utf8");

describe("MarketRegimeStrip", () => {
  it("renders regime chips with trust-safe unavailable copy", () => {
    expect(source).toContain("data-testid=\"dashboard-regime-strip\"");
    expect(source).toContain("breadthPhaseLabel");
    expect(source).toContain("Unavailable");
    expect(source).toContain("Above EMA20");
    expect(source).toContain("52W highs");
  });
});
