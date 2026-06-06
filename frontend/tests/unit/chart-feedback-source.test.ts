import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/charts/[symbol]/page.tsx", "utf8");
const chartDataHook = readFileSync("components/charts/hooks/useChartData.ts", "utf8");

describe("chart feedback copy", () => {
  it("uses stable action-oriented copy for chart workspace failures", () => {
    expect(source).toContain("Chart layout could not be saved. Check Data Status, then try again.");
    expect(source).toContain("Chart drawing changes could not be saved. Check Data Status, then try again.");
    expect(source).toContain("Open Watchlist or Data Status, then try again.");
    expect(source).toContain("Price alert could not be saved. Check Alerts or Data Status, then try again.");
    expect(source).toContain("Position levels could not be saved. Check Journal or Data Status, then try again.");
  });

  it("does not expose raw backend messages for chart watchlist and alert actions", () => {
    expect(source).not.toContain('setAlertMsg(e instanceof Error ? e.message : "Failed")');
    expect(source).not.toContain('setQuickAlertMsg(e instanceof Error ? e.message : "Alert failed")');
    expect(source).not.toContain('setWlMsg(e instanceof Error ? e.message : "Error")');
    expect(source).not.toContain("setWatchlistsError(error instanceof Error ? error.message");
    expect(source).not.toContain("showDrawingPersistenceError(error,");
  });

  it("prefers full candle-window EMA overlays for long-range chart review", () => {
    expect(chartDataHook).toContain("function computePrecomputedEmaLine");
    expect(chartDataHook).toContain('ema200: "ema_200"');
    expect(chartDataHook).toContain("buildCandleEmaIndicatorPayload");
    expect(chartDataHook).toContain("canUsePrecomputedCandleEmas");
  });

  it("opens full chart review on the five-year launch contract range", () => {
    expect(source).toContain('const initialRangeLabel: WatchlistChartTimeframe = fullChartMode ? "5Y" : "1Y";');
    expect(source).toContain('setRangeLabel(layout.timeframe === "D" ? initialRangeLabel : layout.timeframe === "W" ? "3Y" : "Max");');
  });
});
