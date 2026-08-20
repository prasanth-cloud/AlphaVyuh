import type {
  CreateScannerDefinitionRequest,
  ScannerDefinition,
  ScannerDefinitionGroupInput,
  ScannerFilter,
  ScannerFilterGroup,
  ScannerFilterOperator,
  ScannerUniverse,
} from "./api/types";

export type ScannerDefinitionFilterValueType = "number" | "select";

export type ScannerDefinitionFilterOption = {
  kind: string;
  label: string;
  valueType: ScannerDefinitionFilterValueType;
  options?: Array<{ value: string; label: string }>;
};

export type ScannerDefinitionDraftFilter = {
  clientId: string;
  kind: string;
  value: string;
};

export type ScannerDefinitionDraftGroup = {
  clientId: string;
  operator: ScannerFilterOperator;
  filters: ScannerDefinitionDraftFilter[];
};

export const SCANNER_DEFINITION_FILTER_OPTIONS: ScannerDefinitionFilterOption[] = [
  { kind: "price_min", label: "Price at least", valueType: "number" },
  { kind: "price_max", label: "Price at most", valueType: "number" },
  { kind: "volume_ratio_min", label: "Volume ratio at least", valueType: "number" },
  { kind: "avg_volume_50d_min", label: "Average volume at least", valueType: "number" },
  { kind: "rsi_min", label: "RSI 14 at least", valueType: "number" },
  {
    kind: "price_vs_sma50",
    label: "Price vs 50 DMA",
    valueType: "select",
    options: [
      { value: "above", label: "Above" },
      { value: "below", label: "Below" },
    ],
  },
  {
    kind: "price_vs_ema50",
    label: "Price vs 50 EMA",
    valueType: "select",
    options: [
      { value: "above", label: "Above" },
      { value: "below", label: "Below" },
    ],
  },
  { kind: "week_52_high_pct_max", label: "Maximum % below 52-week high", valueType: "number" },
  { kind: "rs_score_min", label: "Relative strength at least", valueType: "number" },
  { kind: "market_cap_min", label: "Market cap at least (₹ Cr)", valueType: "number" },
  { kind: "pe_max", label: "P/E at most", valueType: "number" },
  { kind: "roe_min", label: "ROE at least (%)", valueType: "number" },
  { kind: "roce_min", label: "ROCE at least (%)", valueType: "number" },
  { kind: "debt_to_equity_max", label: "Debt/equity at most", valueType: "number" },
];

const optionByKind = new Map(SCANNER_DEFINITION_FILTER_OPTIONS.map((option) => [option.kind, option]));

function newClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createScannerDefinitionDraftGroup(): ScannerDefinitionDraftGroup {
  return {
    clientId: newClientId("group"),
    operator: "and",
    filters: [createScannerDefinitionDraftFilter()],
  };
}

export function createScannerDefinitionDraftFilter(kind = SCANNER_DEFINITION_FILTER_OPTIONS[0].kind): ScannerDefinitionDraftFilter {
  return { clientId: newClientId("filter"), kind, value: "" };
}

function parseDraftValue(kind: string, rawValue: string): unknown {
  const option = optionByKind.get(kind);
  if (!option) return rawValue.trim();
  if (option.valueType === "number") {
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : null;
  }
  return rawValue.trim();
}

export function validateScannerDefinitionDraft(
  name: string,
  groups: ScannerDefinitionDraftGroup[],
): string | null {
  if (!name.trim()) return "Definition name is required.";
  if (groups.length === 0) return "Add at least one filter group.";
  for (const group of groups) {
    if (group.filters.length === 0) return "Each filter group needs at least one filter.";
    for (const filter of group.filters) {
      if (!optionByKind.has(filter.kind)) return "Choose a supported scanner filter.";
      if (parseDraftValue(filter.kind, filter.value) === null || filter.value.trim() === "") {
        return "Complete every filter value before saving.";
      }
    }
  }
  return null;
}

export function buildScannerDefinitionRequest(
  name: string,
  universe: ScannerUniverse,
  groups: ScannerDefinitionDraftGroup[],
): CreateScannerDefinitionRequest {
  const normalizedGroups: ScannerDefinitionGroupInput[] = groups.map((group, groupIndex) => ({
    operator: group.operator,
    sort_order: groupIndex,
    filters: group.filters.map((filter, filterIndex) => ({
      kind: filter.kind,
      value: parseDraftValue(filter.kind, filter.value),
      sort_order: filterIndex,
    })),
  }));
  return {
    name: name.trim(),
    universe,
    definition: {
      schema_version: 1,
      builder: "scanner-definition",
      filter_count: normalizedGroups.reduce((count, group) => count + group.filters.length, 0),
    },
    groups: normalizedGroups,
  };
}

function filterValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ("value" in record) return record.value;
  if ("min" in record && Object.keys(record).length === 1) return record.min;
  if ("max" in record && Object.keys(record).length === 1) return record.max;
  return value;
}

function groupsForDefinition(definition: ScannerDefinition): ScannerFilterGroup[] {
  if (definition.groups.length > 0) return definition.groups;
  const rawGroups = definition.definition.groups;
  if (!Array.isArray(rawGroups)) return [];
  return rawGroups.filter((group): group is ScannerFilterGroup => Boolean(group && typeof group === "object"));
}

function filtersForGroup(group: ScannerFilterGroup): ScannerFilter[] {
  return Array.isArray(group.filters) ? group.filters : [];
}

export type ScannerDefinitionRunMapping = {
  filters: Record<string, unknown>;
  unsupported: string[];
  runnable: boolean;
};

export function scannerDefinitionToRunMapping(definition: ScannerDefinition): ScannerDefinitionRunMapping {
  const filters: Record<string, unknown> = { series: ["EQ"] };
  const unsupported: string[] = [];
  if (definition.universe !== "all_nse") {
    unsupported.push("This universe has no verified membership source yet; choose All NSE equity.");
  }
  for (const group of groupsForDefinition(definition)) {
    const groupFilters = filtersForGroup(group);
    for (const filter of groupFilters) {
      if (!optionByKind.has(filter.kind)) {
        unsupported.push(filter.kind);
        continue;
      }
      const value = filterValue(filter.value);
      if (value === null || value === undefined || value === "") {
        unsupported.push(`${filter.kind} (missing value)`);
        continue;
      }
      filters[filter.kind] = value;
    }
  }
  return { filters, unsupported, runnable: unsupported.length === 0 };
}

export function scannerDefinitionToDraft(definition: ScannerDefinition): ScannerDefinitionDraftGroup[] {
  return groupsForDefinition(definition).map((group) => ({
    clientId: group.id,
    operator: group.operator,
    filters: filtersForGroup(group).map((filter) => ({
      clientId: filter.id,
      kind: filter.kind,
      value: String(filterValue(filter.value) ?? ""),
    })),
  }));
}
