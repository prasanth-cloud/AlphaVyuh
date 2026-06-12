import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  columnsForPreset,
  detectColumnPreset,
  persistScreenColumnBundle,
  readScreenColumnBundle,
  SCANNER_COLUMN_PRESETS,
} from "@/lib/scanner-result-columns";
import {
  persistScannerViewPreferences,
  readScannerViewPreferences,
  readScannerRowDensity,
  persistScannerRowDensity,
  readFilterRailPreferences,
  persistFilterRailPreferences,
} from "@/lib/scanner-ui-preferences";

function installBrowserStorage() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => local.set(key, value),
      removeItem: (key: string) => local.delete(key),
      clear: () => local.clear(),
    },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
      removeItem: (key: string) => session.delete(key),
      clear: () => session.clear(),
    },
  });
}

describe("scanner column presets", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes trader, vcp, and fundamentals presets", () => {
    expect(SCANNER_COLUMN_PRESETS.map((preset) => preset.id)).toEqual([
      "trader",
      "vcp",
      "fundamentals",
    ]);
    expect(columnsForPreset("trader")[0]).toBe("symbol");
    expect(columnsForPreset("vcp")).toContain("volume_ratio");
    expect(columnsForPreset("fundamentals")).toContain("pe_ratio");
  });

  it("persists column bundles per saved screen", () => {
    const columns = columnsForPreset("vcp");
    persistScreenColumnBundle("screen-123", "vcp", columns);
    expect(readScreenColumnBundle("screen-123")).toEqual({
      presetId: "vcp",
      columns,
    });
    expect(detectColumnPreset(columns)).toBe("vcp");
  });

  it("returns null for unknown screen ids", () => {
    expect(readScreenColumnBundle("missing")).toBeNull();
  });
});

describe("scanner ui preferences", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists list/charts view in session storage", () => {
    persistScannerViewPreferences({ resultsView: "charts", chartsLayout: "4-up" });
    expect(readScannerViewPreferences()).toEqual({
      resultsView: "charts",
      chartsLayout: "4-up",
    });
  });

  it("persists row density in local storage", () => {
    persistScannerRowDensity("compact");
    expect(readScannerRowDensity()).toBe("compact");
  });

  it("clamps filter rail width", () => {
    persistFilterRailPreferences({ width: 999, collapsed: true });
    expect(readFilterRailPreferences()).toEqual({ width: 420, collapsed: true });
  });
});
