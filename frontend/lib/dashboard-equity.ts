import type { JournalAnalytics, JournalStats } from "@/lib/api/types";

export type DashboardEquitySnapshot =
  | { status: "unavailable"; message: string }
  | { status: "empty"; openTrades: number }
  | {
      status: "ready";
      closedTrades: number;
      openTrades: number;
      totalPnl: number;
      winRate: number | null;
      equityCurve: { date: string; cumulative_pnl: number }[];
      monthlyPnl: { month: string; pnl: number }[];
    };

export function buildDashboardEquitySnapshot(input: {
  unavailable?: boolean;
  unavailableMessage?: string;
  stats: JournalStats | null;
  analytics: JournalAnalytics | null;
  closedTrades: number;
  openTrades?: number;
}): DashboardEquitySnapshot {
  if (input.unavailable) {
    return {
      status: "unavailable",
      message: input.unavailableMessage ?? "Journal P&L is temporarily unavailable. Check Data Status before trusting dashboard totals.",
    };
  }

  const openTrades = input.openTrades ?? input.stats?.open_trades ?? 0;
  if (input.closedTrades <= 0) {
    return { status: "empty", openTrades };
  }

  const equityCurve = input.analytics?.equity_curve ?? [];
  const monthlyPnl = input.analytics?.monthly_pnl ?? [];
  const lastCurvePnl = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].cumulative_pnl : null;
  const totalPnl = lastCurvePnl ?? input.stats?.total_pnl ?? 0;
  const winRate = input.stats?.win_rate ?? null;

  return {
    status: "ready",
    closedTrades: input.closedTrades,
    openTrades,
    totalPnl,
    winRate,
    equityCurve,
    monthlyPnl,
  };
}

export function formatDashboardPnl(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function toneForPnl(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "var(--text-secondary)";
  return value >= 0 ? "var(--gain)" : "var(--loss)";
}

export const CHART_TIMEFRAME_PILL_OPTIONS = [
  "1D",
  "1W",
  "1M",
  "3M",
  "6M",
  "1Y",
  "3Y",
  "5Y",
  "Max",
] as const;

export type ChartTimeframePill = (typeof CHART_TIMEFRAME_PILL_OPTIONS)[number];
