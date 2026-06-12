export type ScannerRowDensity = "compact" | "comfortable";
export type ScannerResultsView = "list" | "charts";
export type ScannerChartsLayout = "2-up" | "4-up";

const VIEW_SESSION_KEY = "alphavyuh-scanner-view-v1";
const DENSITY_KEY = "alphavyuh-scanner-density-v1";
const RAIL_KEY = "alphavyuh-scanner-rail-v1";
const HEATMAP_KEY = "alphavyuh-scanner-heatmap-v1";

const DEFAULT_RAIL_WIDTH = 300;
const MIN_RAIL_WIDTH = 220;
const MAX_RAIL_WIDTH = 420;

export function readScannerViewPreferences(): {
  resultsView: ScannerResultsView;
  chartsLayout: ScannerChartsLayout;
} {
  if (typeof window === "undefined") {
    return { resultsView: "list", chartsLayout: "2-up" };
  }
  try {
    const raw = window.sessionStorage.getItem(VIEW_SESSION_KEY);
    if (!raw) return { resultsView: "list", chartsLayout: "2-up" };
    const parsed = JSON.parse(raw) as {
      resultsView?: ScannerResultsView;
      chartsLayout?: ScannerChartsLayout;
    };
    return {
      resultsView: parsed.resultsView === "charts" ? "charts" : "list",
      chartsLayout: parsed.chartsLayout === "4-up" ? "4-up" : "2-up",
    };
  } catch {
    return { resultsView: "list", chartsLayout: "2-up" };
  }
}

export function persistScannerViewPreferences(prefs: {
  resultsView: ScannerResultsView;
  chartsLayout: ScannerChartsLayout;
}): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(VIEW_SESSION_KEY, JSON.stringify(prefs));
}

export function readScannerRowDensity(): ScannerRowDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    const raw = window.localStorage.getItem(DENSITY_KEY);
    return raw === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function persistScannerRowDensity(density: ScannerRowDensity): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DENSITY_KEY, density);
}

export type FilterRailPreferences = {
  width: number;
  collapsed: boolean;
};

export function readFilterRailPreferences(): FilterRailPreferences {
  if (typeof window === "undefined") {
    return { width: DEFAULT_RAIL_WIDTH, collapsed: false };
  }
  try {
    const raw = window.localStorage.getItem(RAIL_KEY);
    if (!raw) return { width: DEFAULT_RAIL_WIDTH, collapsed: false };
    const parsed = JSON.parse(raw) as Partial<FilterRailPreferences>;
    const width = Number(parsed.width);
    return {
      width: Number.isFinite(width)
        ? Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, width))
        : DEFAULT_RAIL_WIDTH,
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { width: DEFAULT_RAIL_WIDTH, collapsed: false };
  }
}

export function persistFilterRailPreferences(prefs: FilterRailPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RAIL_KEY, JSON.stringify(prefs));
}

export function clampFilterRailWidth(width: number): number {
  return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, width));
}

export function readScannerHeatmapEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(HEATMAP_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistScannerHeatmapEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(HEATMAP_KEY, enabled ? "1" : "0");
}

export { DEFAULT_RAIL_WIDTH, MIN_RAIL_WIDTH, MAX_RAIL_WIDTH };
