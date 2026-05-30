import { describe, expect, it } from "vitest";

import type { SectorTaxonomyMetadata } from "@/lib/api";
import { sectorTaxonomyPresentation } from "@/lib/sector-taxonomy-copy";

function metadata(overrides: Partial<SectorTaxonomyMetadata> = {}): SectorTaxonomyMetadata {
  return {
    source: "stock_universe.sector",
    contract_as_of: "2026-05-30",
    active_count: 2097,
    active_count_scope: "active_universe",
    classified_count: 2097,
    unmapped_count: 0,
    unmapped_symbols: [],
    unmapped_symbols_truncated: false,
    sector_count: 21,
    sector_counts: [],
    display_filter: {
      minimum_active_symbols: 1,
      hidden_sector_count: 0,
      description: "All mapped sectors are shown.",
    },
    reference: {
      name: "NSE sectoral indices",
      url: "https://www.nseindia.com/static/products-services/indices-sectoral",
      as_of: "2026-03-02",
      relationship: "reference_only_not_equity_universe_source",
    },
    ...overrides,
  };
}

describe("sectorTaxonomyPresentation", () => {
  it("fails closed when taxonomy metadata is missing", () => {
    expect(sectorTaxonomyPresentation(null, "Sector audit is unavailable.")).toMatchObject({
      value: "UNVERIFIED",
      status: "bad",
      detail: "Sector audit is unavailable.",
      dashboardBadge: "Taxonomy unverified",
    });
  });

  it("marks clean mapped sectors as verified for the current contract", () => {
    expect(sectorTaxonomyPresentation(metadata())).toMatchObject({
      value: "21 SECTORS",
      status: "good",
      source: "stock_universe.sector",
      contract: "2026-05-30",
      unmapped: "0",
      dashboardBadge: "Taxonomy source: stock_universe.sector",
    });
  });

  it("warns when sectors are hidden or symbols are unmapped", () => {
    const presentation = sectorTaxonomyPresentation(metadata({
      unmapped_count: 2,
      unmapped_symbols: ["ABC", "XYZ"],
      display_filter: {
        minimum_active_symbols: 3,
        hidden_sector_count: 1,
        description: "Sectors with fewer than 3 active symbols are hidden from this summary.",
      },
    }));

    expect(presentation.status).toBe("warn");
    expect(presentation.detail).toContain("1 hidden sector");
    expect(presentation.detail).toContain("2 unmapped symbols");
    expect(presentation.unmapped).toBe("2 (ABC, XYZ)");
    expect(presentation.dashboardBadge).toBe("Taxonomy needs audit: 1 hidden sector, 2 unmapped symbols");
  });
});
