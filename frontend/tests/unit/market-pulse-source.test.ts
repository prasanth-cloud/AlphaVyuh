import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const desk = readFileSync(new URL("../../components/analytics/MarketPulseDesk.tsx", import.meta.url), "utf8");
const charts = readFileSync(new URL("../../components/analytics/MarketPulseCharts.tsx", import.meta.url), "utf8");

describe("Market Pulse trust and UX source", () => {
  it("keeps the optional research surface informational and provenance-led", () => {
    expect(desk).toContain("Informational only");
    expect(desk).toContain("latest completed session");
    expect(desk).toContain("missing history is not filled with estimates");
    expect(desk).toContain("does not rank stocks or provide trade calls");
  });

  it("labels the participation map honestly and exposes chart values", () => {
    expect(desk).toContain("This is not a canonical RRG");
    expect(charts).toContain("View session values");
    expect(charts).toContain("View map values");
    expect(charts).toContain("Shared scale");
  });
});
