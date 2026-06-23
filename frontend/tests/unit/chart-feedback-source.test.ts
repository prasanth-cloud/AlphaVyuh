import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/charts/[symbol]/page.tsx", "utf8");
const chartDataHook = readFileSync("components/charts/hooks/useChartData.ts", "utf8");
const timeframePillStrip = readFileSync("components/charts/ChartTimeframePillStrip.tsx", "utf8");
const globalStyles = readFileSync("app/globals.css", "utf8");

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

  it("keeps full chart review connected to HTF, journal, and journal-only planning context", () => {
    expect(source).toContain("buildHigherTimeframeReview");
    expect(source).toContain('data-testid="chart-review-cockpit"');
    expect(source).toContain("Journal capture only · broker import only");
    expect(source).toContain("Review history stays informational, not advisory.");
    expect(source).not.toContain("Place live order");
  });

  it("keeps the full chart readout terminal-dense with OHLCV and change context", () => {
    expect(source).toContain('data-testid="chart-terminal-readout"');
    expect(source).toContain("displayBarPrevClose");
    expect(source).toContain("displayBarChangePct");
    expect(source).toContain("fmtPrice(displayBar.open, symbolCurrency)");
    expect(source).toContain("fmtVol(displayBar.volume)");
    expect(source).toContain("{displayBarPositive ? \"+\" : \"\"}{fmtPrice(displayBarChange, symbolCurrency)}");
  });

  it("loads and prefetches panel indicators from chart control intent", () => {
    expect(chartDataHook).toContain('["rsi", "macd", "stoch", "atr"].includes(indicator)');
    expect(source).toContain("PRECOMPUTED_CANDLE_INDICATORS");
    expect(source).toContain("prefetchIndicatorToggle");
    expect(source).toContain("prefetchIndicators(symbol, uniqueIndicators, request.timeframe)");
    expect(source).toContain("prefetchIndicatorToggle(ind.id);");
    expect(source).toContain("onFocus={() => prefetchIndicatorToggle(ind.id)}");
  });

  it("keeps the mobile full-chart command bar wrapped inside the viewport", () => {
    expect(globalStyles).toContain(".chart-command-bar > .workspace-toolbar-group");
    expect(globalStyles).toContain("flex-direction: column;");
    expect(globalStyles).toContain("flex-wrap: wrap;");
    expect(globalStyles).toContain(".chart-command-bar .workspace-chip-button");
    expect(globalStyles).toContain("width: min(180px, 100%);");
    expect(globalStyles).not.toContain("flex-wrap: nowrap;\n    overflow-x: auto;");
  });

  it("keeps timeframe pills visible instead of clipping the right edge on mobile", () => {
    expect(timeframePillStrip).toContain('className="chart-timeframe-pill-strip"');
    expect(timeframePillStrip).toContain('flexWrap: "wrap"');
    expect(timeframePillStrip).toContain('overflowX: "visible"');
    expect(timeframePillStrip).not.toContain('flexWrap: "nowrap"');
  });
});
