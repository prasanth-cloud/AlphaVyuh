import type { DataHealth } from "@/lib/api/types";

export type DashboardAlertPlannerTone = "ready" | "action" | "warn" | "empty";

export type DashboardAlertPlannerSymbol = {
  symbol: string;
  href: string;
};

export type DashboardAlertPlannerPrioritySymbol = {
  symbol: string;
  label: string;
  reason: string;
  href: string;
  chartHref: string;
};

export type DashboardAlertPlannerInput = {
  marketDataStatus: DataHealth["status"] | null;
  alertIssueCount: number;
  scanAlerts: number;
  alertMatchSymbols: number;
  priceAlerts: number;
  triggeredPriceAlerts: number;
  latestScanRunDate?: string | null;
  latestScanAlertName?: string | null;
  latestScanMatchCount?: number | null;
  topAlertSymbols?: DashboardAlertPlannerSymbol[];
  trackedSymbols: number;
  watchlistReviewDue: number;
  openTrades: number;
  brokerConnected: boolean;
  prioritySymbols?: DashboardAlertPlannerPrioritySymbol[];
};

export type DashboardAlertPlannerItem = {
  id: "scan-alerts" | "price-alerts" | "candidate" | "plan" | "automation";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardAlertPlannerTone;
};

export type DashboardAlertPlanner = {
  tone: DashboardAlertPlannerTone;
  headline: string;
  summary: string;
  primaryAction: DashboardAlertPlannerItem;
  items: DashboardAlertPlannerItem[];
  topSymbols: DashboardAlertPlannerSymbol[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardAlertPlannerTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function latestRunLabel(input: DashboardAlertPlannerInput) {
  const name = input.latestScanAlertName?.trim();
  const count = input.latestScanMatchCount ?? input.alertMatchSymbols;
  if (name && input.latestScanRunDate) return `${name} · ${plural(Math.max(0, count), "match", "matches")} on ${input.latestScanRunDate}`;
  if (name) return `${name} · ${plural(Math.max(0, count), "match", "matches")}`;
  if (input.latestScanRunDate) return `${plural(Math.max(0, count), "match", "matches")} on ${input.latestScanRunDate}`;
  return `${plural(Math.max(0, input.alertMatchSymbols), "matched symbol")} waiting`;
}

export function buildDashboardAlertPlanner(input: DashboardAlertPlannerInput): DashboardAlertPlanner {
  const firstPriority = input.prioritySymbols?.[0] ?? null;
  const hasMarketGate = input.marketDataStatus === "degraded" ||
    input.marketDataStatus === "stale" ||
    input.marketDataStatus === "unknown" ||
    !input.marketDataStatus;

  const scanAlerts: DashboardAlertPlannerItem = input.alertIssueCount > 0
    ? {
        id: "scan-alerts",
        label: "Scan triggers",
        value: "Unavailable",
        detail: "Saved scan alerts or recent matches could not be confirmed.",
        href: "/alerts",
        tone: "warn",
      }
    : input.alertMatchSymbols > 0
      ? {
          id: "scan-alerts",
          label: "Scan triggers",
          value: plural(input.alertMatchSymbols, "match", "matches"),
          detail: latestRunLabel(input),
          href: "/alerts",
          tone: "action",
        }
      : input.scanAlerts > 0
        ? {
            id: "scan-alerts",
            label: "Scan triggers",
            value: plural(input.scanAlerts, "armed scan"),
            detail: "Saved scans are waiting for the next completed EOD session.",
            href: "/alerts",
            tone: "ready",
          }
        : {
            id: "scan-alerts",
            label: "Scan triggers",
            value: "None",
            detail: "Create saved scan alerts so setup discovery does not depend on manual reruns.",
            href: "/scanner",
            tone: "empty",
          };

  const priceAlerts: DashboardAlertPlannerItem = input.triggeredPriceAlerts > 0
    ? {
        id: "price-alerts",
        label: "Price levels",
        value: `${input.triggeredPriceAlerts} hit`,
        detail: "Triggered chart levels need a decision: review, archive, or convert to journal context.",
        href: "/alerts",
        tone: "action",
      }
    : input.priceAlerts > 0
      ? {
          id: "price-alerts",
          label: "Price levels",
          value: plural(input.priceAlerts, "armed level"),
          detail: "Chart price alerts are active for breakout, support, or invalidation checks.",
          href: "/alerts",
          tone: "ready",
        }
      : {
          id: "price-alerts",
          label: "Price levels",
          value: "No levels",
          detail: "Set chart alerts from key drawings so levels do not live only in memory.",
          href: firstPriority?.chartHref ?? "/scanner",
          tone: "empty",
        };

  const candidate: DashboardAlertPlannerItem = firstPriority
    ? {
        id: "candidate",
        label: "Next candidate",
        value: firstPriority.symbol,
        detail: `${firstPriority.label}: ${firstPriority.reason}.`,
        href: firstPriority.chartHref,
        tone: "action",
      }
    : input.trackedSymbols > 0
      ? {
          id: "candidate",
          label: "Next candidate",
          value: `${input.trackedSymbols} tracked`,
          detail: "Watchlist queue is available; use scanner alerts to choose the next chart review.",
          href: "/watchlist",
          tone: "ready",
        }
      : {
          id: "candidate",
          label: "Next candidate",
          value: "No queue",
          detail: "Run a scan and add one focused symbol before chart planning.",
          href: "/scanner",
          tone: "empty",
        };

  const plan: DashboardAlertPlannerItem = input.openTrades > 0
    ? {
        id: "plan",
        label: "Plan adherence",
        value: `${input.openTrades} open`,
        detail: "Open plans need stop, target, and invalidation checks before adding new risk.",
        href: "/watchlist",
        tone: "action",
      }
    : input.watchlistReviewDue > 0
      ? {
          id: "plan",
          label: "Plan adherence",
          value: `${input.watchlistReviewDue} due`,
          detail: "Watchlist names need notes or review-later cleanup before fresh alerts are useful.",
          href: "/watchlist",
          tone: "action",
        }
      : input.trackedSymbols > 0
        ? {
            id: "plan",
            label: "Plan adherence",
            value: "Clear",
            detail: "Tracked symbols have enough context for alert-driven chart review.",
            href: "/watchlist",
            tone: "ready",
          }
        : {
            id: "plan",
            label: "Plan adherence",
            value: "Start",
            detail: "A plan queue appears after the first scanner-to-watchlist handoff.",
            href: "/scanner",
            tone: "empty",
          };

  const automation: DashboardAlertPlannerItem = hasMarketGate
    ? {
        id: "automation",
        label: "Automation safety",
        value: "Data gate",
        detail: "Market freshness needs confirmation before alert output should drive decisions.",
        href: "/data",
        tone: "warn",
      }
    : !input.brokerConnected
      ? {
          id: "automation",
          label: "Automation safety",
          value: "Manual import",
          detail: "Broker import is not connected, so alert outcomes may not reconcile with executions.",
          href: "/settings/broker",
          tone: "warn",
        }
      : {
          id: "automation",
          label: "Automation safety",
          value: "Read-only",
          detail: "Data checks, scan alerts, chart alerts, and broker import stay review-only.",
          href: "/settings/broker",
          tone: "ready",
        };

  const items = [scanAlerts, priceAlerts, candidate, plan, automation];
  const sortedActions = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone));
  const primaryAction = sortedActions[0] ?? scanAlerts;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardAlertPlannerTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Alert loop needs a safety check"
    : tone === "action"
      ? "Alert loop has decisions queued"
      : tone === "empty"
        ? "Build the alert loop"
        : "Alert loop ready";
  const summary = tone === "warn"
    ? "Fix data, alert, or import confidence before relying on scanner and chart triggers."
    : tone === "action"
      ? "Triage triggered scans, chart levels, and plan gaps before opening new ideas."
      : tone === "empty"
        ? "Create saved scan alerts and chart price levels to make the dashboard proactive."
        : "Saved scans, price levels, watchlist context, and read-only safety are in place.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    topSymbols: (input.topAlertSymbols ?? []).slice(0, 5),
  };
}
