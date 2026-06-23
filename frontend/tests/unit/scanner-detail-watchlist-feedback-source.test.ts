import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailSource = readFileSync("components/scanner/StockDetailPanel.tsx", "utf8");
const scannerPageSource = readFileSync("app/(app)/scanner/page.tsx", "utf8");

describe("scanner watchlist feedback", () => {
  it("uses stable trader-facing copy for watchlist failures", () => {
    expect(detailSource).toContain("Watchlists unavailable. Open Data Status, then try again.");
    expect(detailSource).toContain("could not be added. Check Watchlist or Data Status, then try again.");
    expect(detailSource).not.toContain("error instanceof Error ? error.message");
    expect(detailSource).not.toContain("e instanceof Error ? e.message");
  });

  it("does not leave the picker empty when no watchlists are available", () => {
    expect(detailSource).toContain("No watchlists available. Create one from the Watchlist page.");
  });

  it("keeps active scanner watchlist failures stable and action-oriented", () => {
    expect(scannerPageSource).toContain("Open Data Status, then try again.");
    expect(scannerPageSource).toContain("Check Watchlist or Data Status, then try again.");
    expect(scannerPageSource).not.toContain("showToast(e instanceof Error ? e.message : 'Add to watchlist failed')");
    expect(scannerPageSource).not.toContain("failures.push(error instanceof Error ? error.message");
    expect(scannerPageSource).not.toContain("Watchlist add is temporarily unavailable.");
  });

  it("keeps taxonomy audit details out of the scanner startup path", () => {
    expect(scannerPageSource).not.toContain("getSectorsWithMetadata");
    expect(scannerPageSource).not.toContain("sectorTaxonomyPresentation");
    expect(scannerPageSource).not.toContain('data-testid="scanner-sector-taxonomy"');
    expect(scannerPageSource).not.toContain('data-testid="scanner-sector-strength"');
  });

  it("routes row review through chart navigation instead of inline workbench expansion", () => {
    expect(scannerPageSource).not.toContain('data-testid="scanner-workbench"');
    expect(scannerPageSource).not.toContain("Why this matched");
    expect(scannerPageSource).toContain("scanner-results-table-tv");
    expect(scannerPageSource).toContain("scanner-history-toggle");
  });

  it("renders large scanner result pages progressively to keep the hot path responsive", () => {
    expect(scannerPageSource).toContain("INITIAL_SCANNER_ROW_RENDER_LIMIT = 60");
    expect(scannerPageSource).toContain("SCANNER_ROW_RENDER_INCREMENT = 60");
    expect(scannerPageSource).toContain("filteredResults.slice(0, renderedRowLimit)");
    expect(scannerPageSource).toContain('data-testid="scanner-render-more-rows"');
    expect(scannerPageSource).toContain("rendering ${renderedResults.length}/${filteredResults.length} rows for speed");
    expect(scannerPageSource).not.toContain("{filteredResults.map((r, rowIndex)");
  });

  it("prefetches chart data from scanner result intent without blocking first render", () => {
    expect(scannerPageSource).toContain("SCANNER_CHART_PREFETCH_LIMIT = 8");
    expect(scannerPageSource).toContain("prefetchedScannerChartKeyRef");
    expect(scannerPageSource).toContain("scannerChartPrefetchKey");
    expect(scannerPageSource).toContain("getWatchlistChartRequest('3M')");
    expect(scannerPageSource).toContain("prefetchCandles(symbol");
    expect(scannerPageSource).toContain("window.setTimeout(() => {");
    expect(scannerPageSource).toContain("onMouseEnter={() => prefetchScannerChart(r.symbol)}");
    expect(scannerPageSource).toContain("onFocus={() => prefetchScannerChart(r.symbol)}");
  });

  it("coalesces only authenticated in-flight scanner runs without speculative preset execution", () => {
    expect(scannerPageSource).toContain("scannerRunInFlight");
    expect(scannerPageSource).toContain("scannerAuthScope");
    expect(scannerPageSource).toContain("crypto.subtle.digest('SHA-256'");
    expect(scannerPageSource).toContain("stableScannerRunKey");
    expect(scannerPageSource).toContain("fetchScannerRunResponse");
    expect(scannerPageSource).not.toContain("prefetchPresetScan");
    expect(scannerPageSource).not.toContain("onMouseEnter={() => prefetchPresetScan(p)}");
    expect(scannerPageSource).not.toContain("onFocus={() => prefetchPresetScan(p)}");
    expect(scannerPageSource).not.toContain("body: JSON.stringify({ ...payload, preset_id:");
  });

  it("ignores stale scanner responses so slower runs cannot overwrite newer results", () => {
    expect(scannerPageSource).toContain("scannerRequestSeqRef");
    expect(scannerPageSource).toContain("beginScannerRequest");
    expect(scannerPageSource).toContain("isCurrentScannerRequest");
    expect(scannerPageSource).toContain("if (!isCurrentScannerRequest(requestSeq)) return");
    expect(scannerPageSource).toContain("if (isCurrentScannerRequest(requestSeq)) setError");
    expect(scannerPageSource).toContain("if (isCurrentScannerRequest(requestSeq)) setLoading(false)");
  });
});
