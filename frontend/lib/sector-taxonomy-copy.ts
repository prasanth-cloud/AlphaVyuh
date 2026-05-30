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
    };
  }

  const hiddenCount = metadata.display_filter.hidden_sector_count;
  const unmappedCount = metadata.unmapped_count;
  const issues = [
    hiddenCount > 0 ? `${fmtNumber(hiddenCount)} hidden sector${hiddenCount === 1 ? "" : "s"}` : "",
    unmappedCount > 0 ? `${fmtNumber(unmappedCount)} unmapped symbol${unmappedCount === 1 ? "" : "s"}` : "",
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
  };
}
