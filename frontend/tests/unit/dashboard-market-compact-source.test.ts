import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/dashboard/MarketOverviewDesk.tsx", "utf8");

describe("compact dashboard market state", () => {
  it("keeps the decision signals and trust links in one glanceable surface", () => {
    expect(source).toContain("Market state");
    expect(source).toContain("Advances / declines");
    expect(source).toContain("Above EMA 20 / 50 / 200");
    expect(source).toContain("New highs / lows");
    expect(source).toContain("Leading sectors");
    expect(source).toContain('href="/data"');
    expect(source).toContain('href="/scanner"');
  });

  it("removes analysis panels that belong outside the dashboard", () => {
    expect(source).not.toContain("HighsLowsBarChart");
    expect(source).not.toContain("EmaBreadthPanel");
    expect(source).not.toContain("MoversList");
    expect(source).not.toContain("MajorSectorGrid");
  });
});
