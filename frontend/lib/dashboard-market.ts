import type { MarketOverview } from "@/lib/api/types";

export type MarketPeriod = "day" | "week" | "month" | "year";
export type HighsLowsPeriod = "daily" | "weekly";

export type MajorSectorDefinition = {
  label: string;
  aliases: readonly string[];
};

/** Eleven NSE-aligned major sectors — excludes minor/sub-sector indices. */
export const MAJOR_SECTOR_DEFINITIONS: readonly MajorSectorDefinition[] = [
  { label: "Auto", aliases: ["Auto", "Automobile"] },
  { label: "Financial Services", aliases: ["Financial Services", "Banks", "Banking", "Finance"] },
  { label: "FMCG", aliases: ["FMCG"] },
  { label: "IT", aliases: ["IT", "IT Services", "Information Technology"] },
  { label: "Media", aliases: ["Media", "Media & Entertainment"] },
  { label: "Metal", aliases: ["Metal", "Metals & Mining"] },
  { label: "Healthcare", aliases: ["Healthcare", "Pharma"] },
  { label: "Realty", aliases: ["Realty"] },
  { label: "Energy", aliases: ["Energy", "Oil and Gas"] },
  { label: "Consumer Durables", aliases: ["Consumer Durables"] },
  { label: "Chemicals", aliases: ["Chemicals"] },
] as const;

export type SectorBreadthRow = MarketOverview["sector_breadth"][number];

export type MajorSectorCell = {
  label: string;
  sector: SectorBreadthRow | null;
};

export function safeMarketNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function formatMarketPercent(value: unknown, digits = 0): string {
  const numeric = safeMarketNumber(value, NaN);
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}%` : "—";
}

export function isMarketOverviewReady(data: MarketOverview | null | undefined, marketError: string): boolean {
  if (marketError || !data?.trade_date) return false;
  return true;
}

function normalizeSectorLabel(value: string): string {
  return value.trim().toLowerCase();
}

function matchesMajorSector(sectorName: string, definition: MajorSectorDefinition): boolean {
  const normalized = normalizeSectorLabel(sectorName);
  return definition.aliases.some((alias) => normalizeSectorLabel(alias) === normalized)
    || normalizeSectorLabel(definition.label) === normalized;
}

export function filterMajorSectorBreadth(sectors: SectorBreadthRow[] | null | undefined): MajorSectorCell[] {
  const rows = Array.isArray(sectors) ? sectors : [];
  return MAJOR_SECTOR_DEFINITIONS.map((definition) => {
    const match = rows.find((row) => matchesMajorSector(row.sector, definition));
    return { label: definition.label, sector: match ?? null };
  });
}

export function breadthPhaseLabel(phase: string): string {
  if (phase === "Bullish") return "Bullish breadth";
  if (phase === "Bearish") return "Weak breadth";
  return "Mixed breadth";
}

export function breadthPhaseColor(phase: string): string {
  if (phase === "Bullish") return "var(--gain)";
  if (phase === "Bearish") return "var(--loss)";
  return "var(--warn)";
}

export type PeriodView<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable"; message: string };

export function resolveHighsLowsView(
  period: HighsLowsPeriod,
  data: MarketOverview,
): PeriodView<{ highs: number; lows: number }> {
  if (period !== "daily") {
    return {
      status: "unavailable",
      message: "Weekly highs vs lows are not available yet. Only the latest session is stored.",
    };
  }
  return {
    status: "ready",
    data: {
      highs: safeMarketNumber(data.new_52w_highs),
      lows: safeMarketNumber(data.new_52w_lows),
    },
  };
}

export type EmaBreadthSeries = {
  ema20: number;
  ema50: number;
  ema200: number;
};

const EMA_PERIOD_LABELS: Record<MarketPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
};

export function emaPeriodLabel(period: MarketPeriod): string {
  return EMA_PERIOD_LABELS[period];
}

export function resolveEmaBreadthView(period: MarketPeriod, data: MarketOverview): PeriodView<EmaBreadthSeries> {
  if (period !== "day") {
    return {
      status: "unavailable",
      message: `${emaPeriodLabel(period)}ly EMA breadth history is not available yet. Only the latest session is stored.`,
    };
  }
  return {
    status: "ready",
    data: {
      ema20: safeMarketNumber(data.above_ema20_pct),
      ema50: safeMarketNumber(data.above_ema50_pct),
      ema200: safeMarketNumber(data.above_ema200_pct),
    },
  };
}

export function sectorHeatColor(breadthPct: number): string {
  if (breadthPct > 60) return "var(--gain)";
  if (breadthPct > 40) return "var(--warn)";
  return "var(--loss)";
}

export function sectorHeatBackground(breadthPct: number): string {
  if (breadthPct > 60) return "rgba(45,181,116,0.14)";
  if (breadthPct > 40) return "rgba(217,119,6,0.12)";
  return "rgba(229,56,59,0.12)";
}
