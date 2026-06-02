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
    expect(scannerPageSource).toContain("Source audit details stay in Data Trust.");
  });

  it("keeps the selected scan result workbench review-only and chart-first", () => {
    expect(scannerPageSource).toContain('data-testid="scanner-workbench"');
    expect(scannerPageSource).toContain("Scan results workbench");
    expect(scannerPageSource).toContain("Chart + broker context");
    expect(scannerPageSource).toContain("Broker action stays journal-only until a plan is confirmed outside the scanner.");
  });
});
