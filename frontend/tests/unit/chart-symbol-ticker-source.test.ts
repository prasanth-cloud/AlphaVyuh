import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chartPageSource = readFileSync(
  resolve(process.cwd(), "app/(app)/charts/[symbol]/page.tsx"),
  "utf8",
);

describe("Chart symbol ticker source", () => {
  it("renders a TradingView-style price block in the command bar", () => {
    expect(chartPageSource).toContain('data-testid="chart-symbol-ticker"');
    expect(chartPageSource).toContain("chart-symbol-ticker-price");
    expect(chartPageSource).toContain("chart-symbol-ticker-change");
  });
});
