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
    reference_coverage: {
      matched_sector_count: 21,
      unmatched_sector_count: 0,
      unmatched_sectors: [],
      description: "Every AlphaVyuh sector has at least one related NSE sectoral-index reference.",
    },
    display_filter: {
      minimum_active_symbols: 1,
      hidden_sector_count: 0,
      description: "All mapped sectors are shown.",
    },
    alias_policy: {
      source: "NSE sectoral index aliases",
      description: "Sector-count aliases are derived only from NSE sectoral-index alias labels. An empty aliases list means AlphaVyuh has no audited NSE alias for that sector label yet.",
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
      aliasPolicy: "Sector-count aliases are derived only from NSE sectoral-index alias labels. An empty aliases list means AlphaVyuh has no audited NSE alias for that sector label yet.",
      dashboardBadge: "Taxonomy source: stock_universe.sector",
    });
  });

  it("warns when sectors are hidden or symbols are unmapped", () => {
    const presentation = sectorTaxonomyPresentation(metadata({
      unmapped_count: 2,
      unmapped_symbols: ["ABC", "XYZ"],
      reference_coverage: {
        matched_sector_count: 20,
        unmatched_sector_count: 1,
        unmatched_sectors: ["Miscellaneous"],
        description: "Some AlphaVyuh sector labels do not map to an NSE sectoral-index reference.",
      },
      display_filter: {
        minimum_active_symbols: 3,
        hidden_sector_count: 1,
        description: "Sectors with fewer than 3 active symbols are hidden from this summary.",
      },
    }));

    expect(presentation.status).toBe("warn");
    expect(presentation.detail).toContain("1 hidden sector");
    expect(presentation.detail).toContain("2 unmapped symbols");
    expect(presentation.detail).toContain("1 sector without NSE sectoral-index reference");
    expect(presentation.unmapped).toBe("2 (ABC, XYZ)");
    expect(presentation.dashboardBadge).toBe("Taxonomy needs audit: 1 hidden sector, 2 unmapped symbols, 1 sector without NSE sectoral-index reference");
  });
});
