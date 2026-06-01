import { describe, expect, it } from "vitest";

import type { SectorTaxonomyMetadata } from "@/lib/api";
import { sectorTaxonomyPresentation } from "@/lib/sector-taxonomy-copy";

function metadata(overrides: Partial<SectorTaxonomyMetadata> = {}): SectorTaxonomyMetadata {
  return {
    source: "stock_universe.sector",
    taxonomy_status: "unverified",
    taxonomy_status_reason: "AlphaVyuh currently derives sector labels from stock_universe.sector. Treat sector counts as provisional until NSE industry classification parity is audited.",
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
    audit_scope: {
      sector_labels: {
        source: "stock_universe.sector",
        status: "not_audited",
        description: "AlphaVyuh sector counts are grouped from active stock_universe.sector labels; the labels are not yet audited against NSE industry classification.",
      },
      sectoral_index_reference: {
        source: "NSE sectoral indices",
        status: "reference_only",
        description: "NSE sectoral-index labels are used only as a public reference and alias source.",
      },
      industry_taxonomy: {
        source: "NSE industry classification",
        status: "not_audited",
        description: "NSE industry-level classification is not yet mapped into AlphaVyuh sector counts; treat industry parity as unverified until a separate industry taxonomy audit lands.",
      },
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
      approvalStatus: "Unavailable",
      approvalDetail: "Sector source approval cannot be granted until taxonomy metadata loads.",
      launchApprovalBadge: "Source approval unavailable",
      dashboardBadge: "Taxonomy unverified",
    });
  });

  it("warns when industry taxonomy is still outside the current audit", () => {
    expect(sectorTaxonomyPresentation(metadata())).toMatchObject({
      value: "21 SECTORS",
      status: "warn",
      source: "stock_universe.sector",
      contract: "2026-05-30",
      unmapped: "0",
      referenceCoverage: "All mapped sectors have an NSE sectoral-index reference.",
      auditStatus: "Unverified: AlphaVyuh currently derives sector labels from stock_universe.sector. Treat sector counts as provisional until NSE industry classification parity is audited.",
      aliasPolicy: "Sector-count aliases are derived only from NSE sectoral-index alias labels. An empty aliases list means AlphaVyuh has no audited NSE alias for that sector label yet.",
      industryScope: "NSE industry-level classification is not yet mapped into AlphaVyuh sector counts; treat industry parity as unverified until a separate industry taxonomy audit lands.",
      approvalStatus: "Needs owner/data approval",
      approvalDetail: "Use sector labels for navigation only; do not market sector or industry rankings as final until source and audit gaps are owner-approved.",
      launchApprovalBadge: "Source approval pending",
      dashboardBadge: "Taxonomy needs audit: sector taxonomy unverified, industry taxonomy unaudited",
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
    expect(presentation.detail).toContain("sector taxonomy unverified");
    expect(presentation.detail).toContain("industry taxonomy unaudited");
    expect(presentation.unmapped).toBe("2 (ABC, XYZ)");
    expect(presentation.referenceCoverage).toBe("1 without NSE sectoral-index reference (Miscellaneous)");
    expect(presentation.dashboardBadge).toBe("Taxonomy needs audit: sector taxonomy unverified, 1 hidden sector, 2 unmapped symbols, 1 sector without NSE sectoral-index reference, industry taxonomy unaudited");
  });

  it("lists the sector labels missing NSE sectoral-index references", () => {
    const presentation = sectorTaxonomyPresentation(metadata({
      reference_coverage: {
        matched_sector_count: 15,
        unmatched_sector_count: 6,
        unmatched_sectors: ["Consumer Services", "Diversified", "Telecom", "Utilities", "Textiles", "Miscellaneous"],
        description: "Some AlphaVyuh sector labels do not map to an NSE sectoral-index reference.",
      },
    }));

    expect(presentation.referenceCoverage).toBe("6 without NSE sectoral-index reference (Consumer Services, Diversified, Telecom, Utilities, Textiles, ...)");
  });

  it("keeps the sector contract unverified until the taxonomy status is audited", () => {
    expect(sectorTaxonomyPresentation(metadata({
      audit_scope: {
        ...metadata().audit_scope,
        industry_taxonomy: {
          source: "NSE industry classification",
          status: "audited",
          description: "NSE industry-level classification has been audited against AlphaVyuh sector counts.",
        },
      },
    }))).toMatchObject({
      status: "warn",
      dashboardBadge: "Taxonomy needs audit: sector taxonomy unverified",
    });
  });

  it("can mark the current sector contract clean once sector and industry taxonomy are audited", () => {
    expect(sectorTaxonomyPresentation(metadata({
      taxonomy_status: "audited",
      taxonomy_status_reason: "NSE sector and industry taxonomy parity has been audited.",
      audit_scope: {
        ...metadata().audit_scope,
        sector_labels: {
          source: "stock_universe.sector",
          status: "audited",
          description: "AlphaVyuh sector labels have been audited against NSE industry classification.",
        },
        industry_taxonomy: {
          source: "NSE industry classification",
          status: "audited",
          description: "NSE industry-level classification has been audited against AlphaVyuh sector counts.",
        },
      },
    }))).toMatchObject({
      status: "good",
      auditStatus: "Audited",
      approvalStatus: "Approved for launch",
      approvalDetail: "Sector source, contract date, reference coverage, and industry taxonomy are audited for launch claims.",
      launchApprovalBadge: "Sector source approved",
      dashboardBadge: "Taxonomy source: stock_universe.sector",
    });
  });
});
