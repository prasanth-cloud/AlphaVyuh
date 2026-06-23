import type { DataHealth } from "@/lib/api/types";
import type { DashboardPrioritySymbol } from "@/lib/dashboard-action-brief";

export type DashboardEventTone = "ready" | "action" | "warn" | "empty";

export type DashboardEventRadarInput = {
  marketDataStatus: DataHealth["status"] | null;
  marketDataMode?: string | null;
  tradeDate: string | null;
  latestTradeDate?: string | null;
  hoursSinceRefresh?: number | null;
  trackedSymbols: number;
  watchlistReviewDue: number;
  openTrades: number;
  scanAlerts: number;
  alertMatchSymbols: number;
  priceAlerts: number;
  triggeredPriceAlerts: number;
  accountIssueCount: number;
  alertIssueCount: number;
  prioritySymbols?: DashboardPrioritySymbol[];
  eventFeedConnected?: boolean;
  upcomingEventsCount?: number | null;
};

export type DashboardEventRadarItem = {
  id: "freshness" | "calendar" | "exposure" | "alerts" | "plan";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardEventTone;
};

export type DashboardEventRadarSymbol = {
  symbol: string;
  label: string;
  detail: string;
  href: string;
};

export type DashboardEventRadar = {
  tone: DashboardEventTone;
  headline: string;
  summary: string;
  primaryAction: DashboardEventRadarItem;
  items: DashboardEventRadarItem[];
  symbols: DashboardEventRadarSymbol[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardEventTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function dateLabel(input: DashboardEventRadarInput) {
  return input.latestTradeDate ?? input.tradeDate ?? "date pending";
}

function statusNeedsReview(status: DashboardEventRadarInput["marketDataStatus"]) {
  return status === "degraded" || status === "stale" || status === "unknown" || !status;
}

function statusLabel(status: DashboardEventRadarInput["marketDataStatus"]) {
  if (status === "healthy") return "Fresh";
  if (status === "degraded") return "Degraded";
  if (status === "stale") return "Stale";
  if (status === "unknown") return "Unknown";
  return "Missing";
}

function hasEventExposure(input: DashboardEventRadarInput) {
  return input.openTrades > 0 ||
    input.trackedSymbols > 0 ||
    input.alertMatchSymbols > 0 ||
    input.triggeredPriceAlerts > 0 ||
    (input.prioritySymbols?.length ?? 0) > 0;
}

function symbolQueue(input: DashboardEventRadarInput): DashboardEventRadarSymbol[] {
  return (input.prioritySymbols ?? []).slice(0, 4).map((item) => ({
    symbol: item.symbol,
    label: item.label,
    detail: item.reason,
    href: item.chartHref,
  }));
}

export function buildDashboardEventRadar(input: DashboardEventRadarInput): DashboardEventRadar {
  const calendarConnected = input.eventFeedConnected === true;
  const upcomingEvents = Math.max(0, input.upcomingEventsCount ?? 0);
  const exposureExists = hasEventExposure(input);
  const dataGate = input.accountIssueCount > 0 ||
    input.alertIssueCount > 0 ||
    statusNeedsReview(input.marketDataStatus);
  const calendarGap = !calendarConnected;

  const freshnessItem: DashboardEventRadarItem = {
    id: "freshness",
    label: "Data freshness",
    value: statusLabel(input.marketDataStatus),
    detail: input.hoursSinceRefresh == null
      ? `${input.marketDataMode === "demo" ? "Demo" : "EOD"} context as of ${dateLabel(input)}.`
      : `${input.hoursSinceRefresh.toFixed(1)}h since refresh · session ${dateLabel(input)}.`,
    href: "/data",
    tone: statusNeedsReview(input.marketDataStatus) ? "warn" : "ready",
  };

  const calendarItem: DashboardEventRadarItem = calendarConnected
    ? {
        id: "calendar",
        label: "Calendar feed",
        value: upcomingEvents > 0 ? plural(upcomingEvents, "event") : "Clear",
        detail: upcomingEvents > 0
          ? "Upcoming earnings or economic events need a plan before new entries."
          : "Calendar coverage is connected and no near-term event conflict is flagged.",
        href: upcomingEvents > 0 ? "/watchlist" : "/dashboard",
        tone: upcomingEvents > 0 ? "action" : "ready",
      }
    : {
        id: "calendar",
        label: "Calendar feed",
        value: "Not wired",
        detail: exposureExists
          ? "Earnings and economic calendar data are not connected yet; manually check events before entries."
          : "Calendar coverage is a product gap to close before serious planning scale.",
        href: "/data",
        tone: exposureExists ? "action" : "empty",
      };

  const exposureItem: DashboardEventRadarItem = input.openTrades > 0
    ? {
        id: "exposure",
        label: "Open exposure",
        value: plural(input.openTrades, "open plan"),
        detail: "Confirm earnings, policy, and news risk before managing or adding exposure.",
        href: "/journal",
        tone: "action",
      }
    : input.trackedSymbols > 0
      ? {
          id: "exposure",
          label: "Open exposure",
          value: `${input.trackedSymbols} tracked`,
          detail: input.watchlistReviewDue > 0
            ? `${plural(input.watchlistReviewDue, "symbol")} need watchlist notes before event review.`
            : "Tracked names are ready for a manual event check before chart work.",
          href: "/watchlist",
          tone: input.watchlistReviewDue > 0 ? "action" : "ready",
        }
      : {
          id: "exposure",
          label: "Open exposure",
          value: "No queue",
          detail: "Add scanner candidates to a watchlist before event risk can be reviewed.",
          href: "/scanner",
          tone: "empty",
        };

  const alertsItem: DashboardEventRadarItem = input.alertIssueCount > 0
    ? {
        id: "alerts",
        label: "Alert context",
        value: "Unavailable",
        detail: "Recent scanner or price-alert evidence could not be loaded.",
        href: "/alerts",
        tone: "warn",
      }
    : input.alertMatchSymbols > 0 || input.triggeredPriceAlerts > 0
      ? {
          id: "alerts",
          label: "Alert context",
          value: input.alertMatchSymbols > 0
            ? plural(input.alertMatchSymbols, "scan match", "scan matches")
            : plural(input.triggeredPriceAlerts, "triggered alert"),
          detail: "Check event risk before turning fresh alerts into trade plans.",
          href: "/alerts",
          tone: "action",
        }
      : input.scanAlerts > 0 || input.priceAlerts > 0
        ? {
            id: "alerts",
            label: "Alert context",
            value: plural(input.scanAlerts + input.priceAlerts, "armed alert"),
            detail: "Alerts are armed; event review should happen before acting on new triggers.",
            href: "/alerts",
            tone: "ready",
          }
        : {
            id: "alerts",
            label: "Alert context",
            value: "Not armed",
            detail: "Create scanner or price alerts so event review has a live queue.",
            href: "/scanner",
            tone: "empty",
          };

  const planItem: DashboardEventRadarItem = dataGate
    ? {
        id: "plan",
        label: "Decision gate",
        value: "Blocked",
        detail: "Fix data or alert availability before using the event radar.",
        href: "/data",
        tone: "warn",
      }
    : calendarGap && exposureExists
      ? {
          id: "plan",
          label: "Decision gate",
          value: "Manual check",
          detail: "Until calendar coverage ships, verify events outside AlphaVyuh before committing size.",
          href: input.openTrades > 0 ? "/journal" : "/watchlist",
          tone: "action",
        }
      : !exposureExists
        ? {
            id: "plan",
            label: "Decision gate",
            value: "Build queue",
            detail: "Start with scanner candidates, alerts, or a watchlist before event checks matter.",
            href: "/scanner",
            tone: "empty",
          }
        : {
            id: "plan",
            label: "Decision gate",
            value: upcomingEvents > 0 ? "Plan events" : "Clear",
            detail: upcomingEvents > 0
              ? "Document the event plan on the watchlist before taking the next trade."
              : "No calendar or data guardrail is blocking the current queue.",
            href: upcomingEvents > 0 ? "/watchlist" : "/dashboard",
            tone: upcomingEvents > 0 ? "action" : "ready",
          };

  const items = [freshnessItem, calendarItem, exposureItem, alertsItem, planItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? calendarItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardEventTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Event review is gated"
    : tone === "action"
      ? "Manual event check required"
      : tone === "empty"
        ? "Build an event-aware queue"
        : "Event context is covered";
  const summary = tone === "warn"
    ? "Data or alert availability must be trusted before event risk can shape decisions."
    : tone === "action"
      ? "AlphaVyuh does not yet connect earnings or economic calendars, so exposure needs a manual event check."
      : tone === "empty"
        ? "Create scanner alerts, watchlist focus, or journal exposure before event risk can be reviewed."
        : "Calendar, freshness, alerts, and exposure are clear enough for the current workflow.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    symbols: symbolQueue(input),
  };
}
