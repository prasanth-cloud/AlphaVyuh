import type { SectorTaxonomyMetadata } from "./api";

type SectorTaxonomyStatus = "good" | "warn" | "bad";

export type SectorTaxonomyPresentation = {
  value: string;
  detail: string;
  status: SectorTaxonomyStatus;
  source: string;
  contract: string;
  reference: string;
  unmapped: string;
  displayFilter: string;
  referenceCoverage: string;
  auditStatus: string;
  aliasPolicy: string;
  industryScope: string;
  dashboardBadge: string;
};

function fmtNumber(value: number | null | undefined) {
  if (value == null) return "Not available";
  return value.toLocaleString("en-IN");
}

export function sectorTaxonomyPresentation(
  metadata: SectorTaxonomyMetadata | null | undefined,
  error?: string,
): SectorTaxonomyPresentation {
  if (!metadata) {
    return {
      value: "UNVERIFIED",
      detail: error || "Sector taxonomy metadata did not load; treat sector filters as unverified until the audit endpoint responds.",
      status: "bad",
      source: "Not available",
      contract: "Not available",
      reference: "Not available",
      unmapped: "Not available",
      displayFilter: "Not available",
      referenceCoverage: "Not available",
      auditStatus: "Unverified",
      aliasPolicy: "Not available",
      industryScope: "Not available",
      dashboardBadge: "Taxonomy unverified",
    };
  }

  const hiddenCount = metadata.display_filter.hidden_sector_count;
  const unmappedCount = metadata.unmapped_count;
  const unmatchedReferenceCount = metadata.reference_coverage?.unmatched_sector_count ?? 0;
  const unmatchedReferenceSectors = metadata.reference_coverage?.unmatched_sectors ?? [];
  const unmatchedReferencePreview = unmatchedReferenceSectors.slice(0, 5).join(", ");
  const taxonomyStatus = metadata.taxonomy_status ?? "unverified";
  const industryStatus = metadata.audit_scope?.industry_taxonomy?.status ?? "not_available";
  const issues = [
    taxonomyStatus !== "audited" ? "sector taxonomy unverified" : "",
    hiddenCount > 0 ? `${fmtNumber(hiddenCount)} hidden sector${hiddenCount === 1 ? "" : "s"}` : "",
    unmappedCount > 0 ? `${fmtNumber(unmappedCount)} unmapped symbol${unmappedCount === 1 ? "" : "s"}` : "",
    unmatchedReferenceCount > 0
      ? `${fmtNumber(unmatchedReferenceCount)} sector${unmatchedReferenceCount === 1 ? "" : "s"} without NSE sectoral-index reference`
      : "",
    industryStatus !== "audited" ? "industry taxonomy unaudited" : "",
  ].filter(Boolean);
  const status: SectorTaxonomyStatus = issues.length ? "warn" : "good";
  const source = metadata.source || "Not available";
  const contract = metadata.contract_as_of || "Not available";
  const reference = metadata.reference
    ? `${metadata.reference.name} as of ${metadata.reference.as_of}`
    : "Not available";
  const detail = issues.length
    ? `Source ${source}, contract ${contract}; ${issues.join(" and ")} need audit before sector counts are treated as final.`
    : `Source ${source}, contract ${contract}; all mapped active sectors are shown.`;
  const referenceCoverage = unmatchedReferenceCount > 0
    ? `${fmtNumber(unmatchedReferenceCount)} without NSE sectoral-index reference (${unmatchedReferencePreview}${unmatchedReferenceSectors.length > 5 || unmatchedReferenceCount > unmatchedReferenceSectors.length ? ", ..." : ""})`
    : "All mapped sectors have an NSE sectoral-index reference.";

  return {
    value: `${fmtNumber(metadata.sector_count)} SECTORS`,
    detail,
    status,
    source,
    contract,
    reference,
    unmapped: unmappedCount
      ? `${fmtNumber(unmappedCount)} (${metadata.unmapped_symbols.slice(0, 5).join(", ")}${metadata.unmapped_symbols_truncated ? ", ..." : ""})`
      : "0",
    displayFilter: metadata.display_filter.description,
    referenceCoverage,
    auditStatus: taxonomyStatus === "audited"
      ? "Audited"
      : `Unverified${metadata.taxonomy_status_reason ? `: ${metadata.taxonomy_status_reason}` : ""}`,
    aliasPolicy: metadata.alias_policy?.description ?? "NSE alias policy not available.",
    industryScope: metadata.audit_scope?.industry_taxonomy?.description ?? "NSE industry taxonomy scope is not available.",
    dashboardBadge: issues.length
      ? `Taxonomy needs audit: ${issues.join(", ")}`
      : `Taxonomy source: ${source}`,
  };
}
