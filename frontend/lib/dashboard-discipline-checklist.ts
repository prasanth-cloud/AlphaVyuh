import type { DataHealth } from "@/lib/api/types";

export type DashboardDisciplineTone = "ready" | "action" | "warn" | "empty";

export type DashboardDisciplineChecklistInput = {
  marketDataStatus: DataHealth["status"] | null;
  accountIssueCount: number;
  alertIssueCount: number;
  trackedSymbols: number;
  watchlistReviewDue: number;
  openTrades: number;
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  brokerConnected: boolean;
  brokerCanImport: boolean;
  brokerTokenExpired: boolean;
  priceAlerts: number;
  triggeredPriceAlerts: number;
  eventFeedConnected?: boolean;
};

export type DashboardDisciplineRule = {
  id: "data" | "focus" | "risk" | "review" | "event" | "import";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardDisciplineTone;
};

export type DashboardDisciplineChecklist = {
  tone: DashboardDisciplineTone;
  score: number;
  headline: string;
  summary: string;
  primaryRule: DashboardDisciplineRule;
  rules: DashboardDisciplineRule[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardDisciplineTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function rulePoints(tone: DashboardDisciplineTone) {
  if (tone === "ready") return 100;
  if (tone === "action") return 58;
  if (tone === "empty") return 32;
  return 12;
}

function dataNeedsReview(status: DashboardDisciplineChecklistInput["marketDataStatus"]) {
  return status === "degraded" || status === "stale" || status === "unknown" || !status;
}

export function buildDashboardDisciplineChecklist(
  input: DashboardDisciplineChecklistInput,
): DashboardDisciplineChecklist {
  const closedTrades = Math.max(0, input.closedTrades);
  const knownUnreviewedTrades = Math.max(
    0,
    input.knownUnreviewedTrades ?? closedTrades - input.reviewedTrades,
  );
  const reviewedTrades = input.reviewCoveragePartial === true
    ? Math.max(0, closedTrades - knownUnreviewedTrades)
    : Math.min(closedTrades, Math.max(0, input.reviewedTrades));
  const reviewCoverage = closedTrades > 0 && input.reviewCoveragePartial !== true
    ? Math.round((reviewedTrades / closedTrades) * 100)
    : null;

  const dataRule: DashboardDisciplineRule = input.accountIssueCount > 0 || input.alertIssueCount > 0 || dataNeedsReview(input.marketDataStatus)
    ? {
        id: "data",
        label: "Data trusted",
        value: "Check",
        detail: "Resolve market, account, or alert availability before using dashboard signals.",
        href: "/data",
        tone: "warn",
      }
    : {
        id: "data",
        label: "Data trusted",
        value: "Clear",
        detail: "Market and workflow evidence are available for the current session.",
        href: "/data",
        tone: "ready",
      };

  const focusRule: DashboardDisciplineRule = input.trackedSymbols === 0
    ? {
        id: "focus",
        label: "Focus queue",
        value: "Empty",
        detail: "Run scanner and build one watchlist before judging setups.",
        href: "/scanner",
        tone: "empty",
      }
    : input.watchlistReviewDue > 0
      ? {
          id: "focus",
          label: "Focus queue",
          value: `${input.watchlistReviewDue} due`,
          detail: "Add notes or clear review-later flags before taking the next entry.",
          href: "/watchlist",
          tone: "action",
        }
      : {
          id: "focus",
          label: "Focus queue",
          value: `${input.trackedSymbols} tracked`,
          detail: "Watchlist context is current enough for chart review.",
          href: "/watchlist",
          tone: "ready",
        };

  const riskRule: DashboardDisciplineRule = input.openTrades > 0
    ? {
        id: "risk",
        label: "Risk defined",
        value: plural(input.openTrades, "open plan"),
        detail: "Confirm stop, target, and invalidation before adding exposure.",
        href: "/watchlist",
        tone: "action",
      }
    : input.triggeredPriceAlerts > 0
      ? {
          id: "risk",
          label: "Risk defined",
          value: `${input.triggeredPriceAlerts} trigger${input.triggeredPriceAlerts === 1 ? "" : "s"}`,
          detail: "Triggered price alerts need a stop and target before becoming trades.",
          href: "/alerts",
          tone: "action",
        }
      : {
          id: "risk",
          label: "Risk defined",
          value: input.priceAlerts > 0 ? `${input.priceAlerts} armed` : "No open risk",
          detail: input.priceAlerts > 0
            ? "Price alerts are armed; define risk when they trigger."
            : "No open exposure is waiting for a risk check.",
          href: input.priceAlerts > 0 ? "/alerts" : "/journal",
          tone: "ready",
        };

  const reviewRule: DashboardDisciplineRule = closedTrades === 0
    ? {
        id: "review",
        label: "Review debt",
        value: "No sample",
        detail: "Close or import trades before review discipline can be measured.",
        href: "/journal",
        tone: "empty",
      }
    : knownUnreviewedTrades > 0
      ? {
          id: "review",
          label: "Review debt",
          value: `${knownUnreviewedTrades} due`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded closed trades still need lessons captured."
            : `${reviewedTrades}/${closedTrades} closed trades have lessons captured.`,
          href: "/journal?review=needs-review",
          tone: "action",
        }
      : {
          id: "review",
          label: "Review debt",
          value: input.reviewCoveragePartial === true ? "Recent clear" : `${reviewCoverage}%`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded journal sample has no review debt."
            : "Closed trades have review notes before new risk is added.",
          href: "/journal?tab=analytics",
          tone: "ready",
        };

  const eventRule: DashboardDisciplineRule = input.eventFeedConnected === true
    ? {
        id: "event",
        label: "Event check",
        value: "Connected",
        detail: "Calendar coverage is available for event-aware planning.",
        href: "/dashboard",
        tone: "ready",
      }
    : input.trackedSymbols > 0 || input.openTrades > 0
      ? {
          id: "event",
          label: "Event check",
          value: "Manual",
          detail: "Earnings and macro calendar data are not wired yet; check events outside AlphaVyuh.",
          href: "/data",
          tone: "action",
        }
      : {
          id: "event",
          label: "Event check",
          value: "Pending",
          detail: "Calendar coverage matters once a watchlist or open plan exists.",
          href: "/scanner",
          tone: "empty",
        };

  const importRule: DashboardDisciplineRule = input.brokerConnected && input.brokerCanImport && !input.brokerTokenExpired
    ? {
        id: "import",
        label: "Execution import",
        value: "Ready",
        detail: "Read-only import can keep execution history aligned with journal review.",
        href: "/settings/broker",
        tone: "ready",
      }
    : input.brokerConnected && input.brokerTokenExpired
      ? {
          id: "import",
          label: "Execution import",
          value: "Reconnect",
          detail: "Broker token is expired, so imports may miss current executions.",
          href: "/settings/broker",
          tone: "warn",
        }
      : {
          id: "import",
          label: "Execution import",
          value: "Manual",
          detail: "Broker import is not ready; keep journal entries reconciled manually.",
          href: "/settings/broker",
          tone: "action",
        };

  const rules = [dataRule, focusRule, riskRule, reviewRule, eventRule, importRule];
  const primaryRule = [...rules].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? dataRule;
  const score = Math.round(rules.reduce((sum, rule) => sum + rulePoints(rule.tone), 0) / rules.length);
  const hasWarn = rules.some((rule) => rule.tone === "warn");
  const hasAction = rules.some((rule) => rule.tone === "action");
  const hasEmpty = rules.some((rule) => rule.tone === "empty");
  const tone: DashboardDisciplineTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Discipline gate is blocked"
    : tone === "action"
      ? "Rules need a pre-trade check"
      : tone === "empty"
        ? "Build the rules loop"
        : "Rules are clear";
  const summary = tone === "warn"
    ? "Fix blocked data or import evidence before trusting the next dashboard action."
    : tone === "action"
      ? "Clear the active rule checks before adding exposure or treating an alert as a setup."
      : tone === "empty"
        ? "Start with scanner candidates, watchlist context, and reviewed trade outcomes."
        : "Data, focus, risk, review, event, and import rules are in a usable state.";

  return {
    tone,
    score,
    headline,
    summary,
    primaryRule,
    rules,
  };
}
