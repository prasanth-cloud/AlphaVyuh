import { buildMultiChartReviewHref } from "@/lib/multi-chart-review";
import type { DataHealth } from "@/lib/api/types";

export type DashboardChartWorkbenchTone = "ready" | "action" | "warn" | "empty";

export type DashboardChartWorkbenchSymbol = {
  symbol: string;
  href: string;
};

export type DashboardChartWorkbenchPrioritySymbol = {
  symbol: string;
  label: string;
  reason: string;
  href: string;
  chartHref: string;
};

export type DashboardChartWorkbenchInput = {
  marketDataStatus: DataHealth["status"] | null;
  alertIssueCount: number;
  priceAlerts: number;
  triggeredPriceAlerts: number;
  topAlertSymbols?: DashboardChartWorkbenchSymbol[];
  prioritySymbols?: DashboardChartWorkbenchPrioritySymbol[];
  trackedSymbols: number;
  watchlistReviewDue: number;
  openTrades: number;
};

export type DashboardChartWorkbenchItem = {
  id: "next" | "board" | "levels" | "context" | "handoff";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardChartWorkbenchTone;
};

export type DashboardChartWorkbench = {
  tone: DashboardChartWorkbenchTone;
  headline: string;
  summary: string;
  primaryAction: DashboardChartWorkbenchItem;
  items: DashboardChartWorkbenchItem[];
  symbols: DashboardChartWorkbenchSymbol[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardChartWorkbenchTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function uniqueSymbols(
  prioritySymbols: DashboardChartWorkbenchPrioritySymbol[] = [],
  topAlertSymbols: DashboardChartWorkbenchSymbol[] = [],
) {
  const rows: DashboardChartWorkbenchSymbol[] = [];
  const seen = new Set<string>();
  for (const row of prioritySymbols.map((symbol) => ({ symbol: symbol.symbol, href: symbol.chartHref }))) {
    const key = row.symbol.toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ symbol: key, href: row.href });
  }
  for (const row of topAlertSymbols) {
    const key = row.symbol.toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ symbol: key, href: row.href });
  }
  return rows.slice(0, 4);
}

export function buildDashboardChartWorkbench(
  input: DashboardChartWorkbenchInput,
): DashboardChartWorkbench {
  const firstPriority = input.prioritySymbols?.[0] ?? null;
  const firstAlertSymbol = input.topAlertSymbols?.[0] ?? null;
  const symbols = uniqueSymbols(input.prioritySymbols, input.topAlertSymbols);
  const hasMarketGate = input.marketDataStatus === "degraded" ||
    input.marketDataStatus === "stale" ||
    input.marketDataStatus === "unknown" ||
    !input.marketDataStatus;

  const nextItem: DashboardChartWorkbenchItem = input.alertIssueCount > 0
    ? {
        id: "next",
        label: "Next chart",
        value: "Unavailable",
        detail: "Alert and candidate context could not be confirmed.",
        href: "/data",
        tone: "warn",
      }
    : firstPriority
      ? {
          id: "next",
          label: "Next chart",
          value: firstPriority.symbol,
          detail: `${firstPriority.label}: ${firstPriority.reason}.`,
          href: firstPriority.chartHref,
          tone: "action",
        }
      : firstAlertSymbol
        ? {
            id: "next",
            label: "Next chart",
            value: firstAlertSymbol.symbol,
            detail: "Open the latest scan-alert symbol in full chart review.",
            href: firstAlertSymbol.href,
            tone: "action",
          }
        : input.trackedSymbols > 0
          ? {
              id: "next",
              label: "Next chart",
              value: `${input.trackedSymbols} tracked`,
              detail: "Choose the next watchlist name after clearing notes and alert context.",
              href: "/watchlist",
              tone: "ready",
            }
          : {
              id: "next",
              label: "Next chart",
              value: "No queue",
              detail: "Run a scanner or create a watchlist before chart review.",
              href: "/scanner",
              tone: "empty",
            };

  const boardHref = symbols.length > 1
    ? buildMultiChartReviewHref(symbols.map((symbol) => symbol.symbol), {
        source: firstPriority ? "watchlist" : "scanner",
        layout: symbols.length <= 2 ? "2-up" : "4-up",
      })
    : firstPriority?.chartHref ?? firstAlertSymbol?.href ?? "/charts";
  const boardItem: DashboardChartWorkbenchItem = symbols.length > 1
    ? {
        id: "board",
        label: "Review board",
        value: `${symbols.length}-symbol`,
        detail: "Open a multi-chart board to compare candidates side by side.",
        href: boardHref,
        tone: "action",
      }
    : symbols.length === 1
      ? {
          id: "board",
          label: "Review board",
          value: "Single",
          detail: "Only one candidate is ready; open the full chart first.",
          href: symbols[0]?.href ?? "/charts",
          tone: "ready",
        }
      : {
          id: "board",
          label: "Review board",
          value: "Pending",
          detail: "A multi-chart board appears after two or more candidates are queued.",
          href: "/scanner",
          tone: "empty",
        };

  const levelsItem: DashboardChartWorkbenchItem = input.triggeredPriceAlerts > 0
    ? {
        id: "levels",
        label: "Chart levels",
        value: `${input.triggeredPriceAlerts} hit`,
        detail: "Triggered price levels need review, archive, or journal context.",
        href: "/alerts",
        tone: "action",
      }
    : input.priceAlerts > 0
      ? {
          id: "levels",
          label: "Chart levels",
          value: plural(input.priceAlerts, "armed level"),
          detail: "Saved chart levels are monitoring breakout, support, or invalidation zones.",
          href: "/alerts",
          tone: "ready",
        }
      : {
          id: "levels",
          label: "Chart levels",
          value: "No levels",
          detail: "Set price alerts from drawings so key levels are not memory-only.",
          href: firstPriority?.chartHref ?? "/scanner",
          tone: "empty",
        };

  const contextItem: DashboardChartWorkbenchItem = hasMarketGate
    ? {
        id: "context",
        label: "Chart context",
        value: "Data gate",
        detail: "Market freshness needs confirmation before chart work drives decisions.",
        href: "/data",
        tone: "warn",
      }
    : input.watchlistReviewDue > 0
      ? {
          id: "context",
          label: "Chart context",
          value: `${input.watchlistReviewDue} due`,
          detail: "Watchlist names need notes or review-later cleanup before chart decisions.",
          href: "/watchlist",
          tone: "action",
        }
      : input.trackedSymbols > 0
        ? {
            id: "context",
            label: "Chart context",
            value: "Ready",
            detail: "Watchlist context is available for full-chart review.",
            href: "/watchlist",
            tone: "ready",
          }
        : {
            id: "context",
            label: "Chart context",
            value: "Empty",
            detail: "Add symbols to a watchlist before chart context can be tracked.",
            href: "/scanner",
            tone: "empty",
          };

  const handoffItem: DashboardChartWorkbenchItem = input.openTrades > 0
    ? {
        id: "handoff",
        label: "Plan handoff",
        value: `${input.openTrades} open`,
        detail: "Open trades need stop, target, and invalidation checks before new chart work.",
        href: "/watchlist",
        tone: "action",
      }
    : symbols.length > 0
      ? {
          id: "handoff",
          label: "Plan handoff",
          value: "Review-only",
          detail: "Use chart review to mark ready, later, or invalidated before adding risk.",
          href: boardHref,
          tone: "ready",
        }
      : {
          id: "handoff",
          label: "Plan handoff",
          value: "Start",
          detail: "Scanner-to-watchlist-to-chart handoff starts after the first candidate.",
          href: "/scanner",
          tone: "empty",
        };

  const items = [nextItem, boardItem, levelsItem, contextItem, handoffItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? nextItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardChartWorkbenchTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Chart workbench needs a safety check"
    : tone === "action"
      ? "Chart review has decisions queued"
      : tone === "empty"
        ? "Build the chart workbench"
        : "Chart workbench ready";
  const summary = tone === "warn"
    ? "Fix data or alert context before relying on chart decisions."
    : tone === "action"
      ? "Open the next chart or multi-chart board, then convert review into plan context."
      : tone === "empty"
        ? "Add scanner candidates, watchlist context, and chart alerts to make chart review actionable."
        : "Candidates, levels, watchlist context, and review-only handoff are connected.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    symbols,
  };
}
