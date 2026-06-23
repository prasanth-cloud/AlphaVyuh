import type { MarketOverview } from "@/lib/api/types";
import { displayCompanyName } from "@/lib/company-display";

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
  const byPeriod = data.highs_lows_by_period;
  const key = period === "weekly" ? "weekly" : "daily";
  const bucket = byPeriod?.[key];
  if (bucket && Number.isFinite(bucket.highs) && Number.isFinite(bucket.lows)) {
    return {
      status: "ready",
      data: {
        highs: safeMarketNumber(bucket.highs),
        lows: safeMarketNumber(bucket.lows),
      },
    };
  }
  if (period !== "daily") {
    return {
      status: "unavailable",
      message: "Weekly highs vs lows are not available yet. Check Data Status before reading rolling 52-week counts.",
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

export type EmaBreadthLookback = "day" | "week" | "month" | "year";

export type EmaBreadthHistoryRow = {
  trade_date: string;
  ema20: number;
  ema50: number;
  ema200: number;
};

export const EMA_BREADTH_LOOKBACK_OPTIONS: readonly { id: EmaBreadthLookback; label: string }[] = [
  { id: "day", label: "Last 7 days" },
  { id: "week", label: "Last 7 weeks" },
  { id: "month", label: "Last 7 months" },
  { id: "year", label: "Last 7 years" },
] as const;

export function hasEmaBreadthYearLookback(data: MarketOverview): boolean {
  const yearRows = data.ema_breadth_lookback?.year;
  return Array.isArray(yearRows) && yearRows.length >= 2;
}

export function visibleEmaBreadthLookbackOptions(data: MarketOverview) {
  return EMA_BREADTH_LOOKBACK_OPTIONS.filter((option) => option.id !== "year" || hasEmaBreadthYearLookback(data));
}

export function resolveEmaBreadthLookbackRows(lookback: EmaBreadthLookback, data: MarketOverview): EmaBreadthHistoryRow[] {
  const bucket = data.ema_breadth_lookback?.[lookback];
  if (Array.isArray(bucket) && bucket.length > 0) {
    return bucket.map((row) => ({
      trade_date: row.trade_date,
      ema20: safeMarketNumber(row.ema20),
      ema50: safeMarketNumber(row.ema50),
      ema200: safeMarketNumber(row.ema200),
    }));
  }
  if (lookback === "day" && Array.isArray(data.ema_breadth_daily_history)) {
    return data.ema_breadth_daily_history.slice(0, 7).map((row) => ({
      trade_date: row.trade_date,
      ema20: safeMarketNumber(row.ema20),
      ema50: safeMarketNumber(row.ema50),
      ema200: safeMarketNumber(row.ema200),
    }));
  }
  return [];
}

export function emaBreadthDeltaTone(current: number, prior: number | undefined): string {
  if (prior == null || !Number.isFinite(prior)) return "var(--text-primary)";
  if (current > prior + 0.05) return "var(--gain)";
  if (current < prior - 0.05) return "var(--loss)";
  return "var(--text-secondary)";
}

export function moverCompanyLabel(symbol: string, companyName: string | null | undefined): string | null {
  const label = displayCompanyName(symbol, companyName);
  return label || null;
}

/** Short label for EMA breadth history rows, e.g. `12th Jun'26`. */
export function formatEmaBreadthTradeDate(tradeDate: string): string {
  const parsed = new Date(`${tradeDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return tradeDate;
  const day = parsed.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st"
    : day % 10 === 2 && day !== 12 ? "nd"
    : day % 10 === 3 && day !== 13 ? "rd"
    : "th";
  const month = parsed.toLocaleString("en-IN", { month: "short" });
  const year = String(parsed.getFullYear()).slice(-2);
  return `${day}${suffix} ${month}'${year}`;
}

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
  const bucket = data.ema_breadth_by_period?.[period];
  if (bucket && Number.isFinite(bucket.ema20)) {
    return {
      status: "ready",
      data: {
        ema20: safeMarketNumber(bucket.ema20),
        ema50: safeMarketNumber(bucket.ema50),
        ema200: safeMarketNumber(bucket.ema200),
      },
    };
  }
  if (period !== "day") {
    return {
      status: "unavailable",
      message: `${emaPeriodLabel(period)}ly EMA breadth history is not available yet. Check Data Status before reading trend participation.`,
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

export function sectorBreadthCaption(basis?: string | null): string {
  if (basis === "advancing_constituents") {
    return "Large % = more stocks closed up vs prior session in that sector. Second line is average session % change.";
  }
  return "Large % = share of sector stocks that advanced on the latest EOD session. Second line is average session % change.";
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
