import { describe, expect, it } from "vitest";
import type { ScannerDefinition } from "@/lib/api/types";
import {
  buildScannerDefinitionRequest,
  scannerDefinitionToDraft,
  scannerDefinitionToRunMapping,
  validateScannerDefinitionDraft,
  type ScannerDefinitionDraftGroup,
} from "@/lib/scanner-definition";

function definition(groups: ScannerDefinition["groups"]): ScannerDefinition {
  return {
    id: "definition-1",
    name: "Trend continuation",
    universe: "all_nse",
    definition: { schema_version: 1 },
    is_active: true,
    groups,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
  };
}

describe("scanner definitions", () => {
  it("serializes the visual builder draft into normalized groups and typed values", () => {
    const groups: ScannerDefinitionDraftGroup[] = [{
      clientId: "group-1",
      operator: "and",
      filters: [
        { clientId: "filter-1", kind: "price_min", value: "100" },
        { clientId: "filter-2", kind: "price_vs_sma50", value: "above" },
      ],
    }];

    expect(validateScannerDefinitionDraft("Trend continuation", groups)).toBeNull();
    expect(buildScannerDefinitionRequest(" Trend continuation ", "all_nse", groups)).toMatchObject({
      name: "Trend continuation",
      definition: { schema_version: 1, filter_count: 2 },
      groups: [{
        operator: "and",
        filters: [
          { kind: "price_min", value: 100, sort_order: 0 },
          { kind: "price_vs_sma50", value: "above", sort_order: 1 },
        ],
      }],
    });
  });

  it("maps an AND definition into the scanner runner contract", () => {
    const mapped = scannerDefinitionToRunMapping(definition([{
      id: "group-1",
      scanner_definition_id: "definition-1",
      operator: "and",
      sort_order: 0,
      filters: [
        { id: "filter-1", group_id: "group-1", kind: "price_min", value: 100, sort_order: 0 },
        { id: "filter-2", group_id: "group-1", kind: "roe_min", value: 15, sort_order: 1 },
      ],
    }]));

    expect(mapped).toEqual({
      filters: { series: ["EQ"], price_min: 100, roe_min: 15 },
      unsupported: [],
      runnable: true,
    });
  });

  it("keeps unsupported OR semantics explicit instead of flattening them into a false scan", () => {
    const mapped = scannerDefinitionToRunMapping(definition([{
      id: "group-1",
      scanner_definition_id: "definition-1",
      operator: "or",
      sort_order: 0,
      filters: [
        { id: "filter-1", group_id: "group-1", kind: "price_min", value: 100, sort_order: 0 },
        { id: "filter-2", group_id: "group-1", kind: "roe_min", value: 15, sort_order: 1 },
      ],
    }]));

    expect(mapped.runnable).toBe(false);
    expect(mapped.unsupported[0]).toContain("OR groups");
    expect(mapped.filters).toMatchObject({ series: ["EQ"], price_min: 100, roe_min: 15 });
  });

  it("restores normalized rows into editable draft groups", () => {
    const groups = scannerDefinitionToDraft(definition([{
      id: "group-1",
      scanner_definition_id: "definition-1",
      operator: "and",
      sort_order: 0,
      filters: [{ id: "filter-1", group_id: "group-1", kind: "price_min", value: 100, sort_order: 0 }],
    }]));

    expect(groups).toEqual([{
      clientId: "group-1",
      operator: "and",
      filters: [{ clientId: "filter-1", kind: "price_min", value: "100" }],
    }]);
  });
});
