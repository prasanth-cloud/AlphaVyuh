export type DashboardWorkflowInput = {
  accountIssues: { id: string }[];
  alertIssues: { id: string }[];
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  watchlistReviewDue: number;
  alertMatchSymbols: number;
  scanAlerts: number;
  trackedSymbols: number;
  watchlists: number;
  openTrades?: number;
  brokerConnected?: boolean;
  prioritySymbols?: {
    symbol: string;
    label: string;
    reason: string;
    href: string;
    chartHref: string;
  }[];
};

export type DashboardSessionFocus = {
  headline: string;
  detail: string;
  primaryLabel: string;
  primaryHref: string;
  streakLabel: string;
  streakValue: string;
  streakDetail: string;
  streakTone: "gain" | "warn" | "accent" | "neutral";
};

export type DashboardAgendaTone = "ready" | "action" | "warn" | "empty";

export type DashboardAgendaItem = {
  id: "data" | "alerts" | "symbol" | "watchlist" | "journal" | "open-risk" | "import" | "scanner";
  label: string;
  title: string;
  detail: string;
  href: string;
  tone: DashboardAgendaTone;
};

export type DashboardSessionAgenda = {
  headline: string;
  detail: string;
  items: DashboardAgendaItem[];
  primaryItem: DashboardAgendaItem;
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function reviewCounts(workflow: DashboardWorkflowInput) {
  const closedTrades = Math.max(0, workflow.closedTrades);
  const knownUnreviewedTrades = Math.max(
    0,
    workflow.knownUnreviewedTrades ?? closedTrades - workflow.reviewedTrades,
  );
  const reviewedTrades = workflow.reviewCoveragePartial === true
    ? Math.max(0, closedTrades - knownUnreviewedTrades)
    : Math.min(closedTrades, Math.max(0, workflow.reviewedTrades));
  const reviewCoverage = closedTrades > 0 && workflow.reviewCoveragePartial !== true
    ? Math.round((reviewedTrades / closedTrades) * 100)
    : null;
  return { closedTrades, reviewedTrades, knownUnreviewedTrades, reviewCoverage };
}

export function getDashboardSessionFocus(workflow: DashboardWorkflowInput): DashboardSessionFocus {
  const { closedTrades, reviewedTrades, knownUnreviewedTrades, reviewCoverage } = reviewCounts(workflow);
  const journalIssue = workflow.accountIssues.some((issue) => issue.id === "journal");
  const watchlistIssue = workflow.accountIssues.some((issue) => issue.id === "watchlists");
  const alertsIssue = workflow.alertIssues.length > 0;
  const reviewDue = knownUnreviewedTrades;
  const reviewCoverageLabel = reviewCoverage == null ? "Recent" : `${reviewCoverage}%`;

  if (workflow.accountIssues.length > 0) {
    return {
      headline: "Account data needs a check",
      detail: "Workflow counts are paused until services respond. Open Data Status before changing watchlists or journal entries.",
      primaryLabel: "Open Data Status",
      primaryHref: "/data",
      streakLabel: "Review coverage",
      streakValue: journalIssue ? "Paused" : reviewCoverageLabel,
      streakDetail: journalIssue ? "Journal stats unavailable" : workflow.reviewCoveragePartial === true ? "Loaded sample only" : `${reviewedTrades} of ${closedTrades} closed trades reviewed`,
      streakTone: "warn",
    };
  }

  if (reviewDue > 0) {
    return {
      headline: `${reviewDue} closed trade${reviewDue === 1 ? "" : "s"} need review`,
      detail: "Finish review notes before adding new scanner ideas. This is where AlphaVyuh becomes decision memory.",
      primaryLabel: "Start journal review",
      primaryHref: "/journal?review=needs-review",
      streakLabel: "Review coverage",
      streakValue: reviewCoverageLabel,
      streakDetail: workflow.reviewCoveragePartial === true ? `${reviewDue} loaded trade${reviewDue === 1 ? "" : "s"} waiting` : `${reviewedTrades} reviewed · ${reviewDue} waiting`,
      streakTone: reviewCoverage != null && reviewCoverage >= 70 ? "gain" : "warn",
    };
  }

  if (!watchlistIssue && workflow.watchlistReviewDue > 0) {
    return {
      headline: `${workflow.watchlistReviewDue} watchlist symbol${workflow.watchlistReviewDue === 1 ? "" : "s"} need context`,
      detail: "Add notes or clear review-later flags before the queue goes stale.",
      primaryLabel: "Open watchlist queue",
      primaryHref: "/watchlist",
      streakLabel: "Review streak",
      streakValue: workflow.reviewCoveragePartial === true ? "Recent clear" : "Clear",
      streakDetail: "Journal review queue is current",
      streakTone: "gain",
    };
  }

  if (!alertsIssue && workflow.alertMatchSymbols > 0) {
    return {
      headline: `${workflow.alertMatchSymbols} scan alert match${workflow.alertMatchSymbols === 1 ? "" : "es"} ready`,
      detail: "Saved scan alerts surfaced new symbols. Triage them into the watchlist before chart review.",
      primaryLabel: "Review scan matches",
      primaryHref: "/alerts",
      streakLabel: "Review coverage",
      streakValue: reviewCoverageLabel,
      streakDetail: "Journal review queue is clear",
      streakTone: reviewCoverage == null || reviewCoverage >= 70 ? "gain" : "accent",
    };
  }

  if (closedTrades < 3) {
    const remaining = 3 - closedTrades;
    return {
      headline: remaining === 3 ? "Build your first review sample" : `${remaining} more close${remaining === 1 ? "" : "s"} to unlock patterns`,
      detail: "Close three trades with review notes before journal-wide coaching becomes useful.",
      primaryLabel: closedTrades === 0 ? "Log first trade" : "Open journal",
      primaryHref: "/journal",
      streakLabel: "Closed trades",
      streakValue: String(closedTrades),
      streakDetail: "3 closes unlock pattern review",
      streakTone: "accent",
    };
  }

  if (workflow.watchlists === 0 || workflow.trackedSymbols === 0) {
    return {
      headline: workflow.watchlists === 0 ? "Create your first watchlist" : "Add symbols to your watchlist",
      detail: "The scan → watchlist → chart loop starts with one focused queue.",
      primaryLabel: workflow.watchlists === 0 ? "Create watchlist" : "Run scanner",
      primaryHref: workflow.watchlists === 0 ? "/watchlist" : "/scanner",
      streakLabel: "Review coverage",
      streakValue: reviewCoverageLabel,
      streakDetail: "Journal review queue is clear",
      streakTone: "gain",
    };
  }

  if (!alertsIssue && workflow.scanAlerts > 0 && workflow.alertMatchSymbols === 0) {
    return {
      headline: `${workflow.scanAlerts} saved scan${workflow.scanAlerts === 1 ? "" : "s"} waiting for EOD`,
      detail: "Alerts are armed. Check matches after the next completed NSE session.",
      primaryLabel: "Open scanner alerts",
      primaryHref: "/alerts",
      streakLabel: "Review coverage",
      streakValue: reviewCoverageLabel,
      streakDetail: "Journal and watchlist queues are clear",
      streakTone: "gain",
    };
  }

  return {
    headline: "Workflow clear — time to discover setups",
    detail: "Data health, journal review, and watchlist context are current. Run the scanner for fresh EOD ideas.",
    primaryLabel: "Run scanner",
    primaryHref: "/scanner",
    streakLabel: "Review coverage",
    streakValue: reviewCoverageLabel,
    streakDetail: workflow.reviewCoveragePartial === true ? "Loaded journal sample reviewed" : `${reviewedTrades} of ${closedTrades} closed trades reviewed`,
    streakTone: reviewCoverage == null || reviewCoverage >= 70 ? "gain" : "accent",
  };
}

export function buildDashboardSessionAgenda(workflow: DashboardWorkflowInput): DashboardSessionAgenda {
  const focus = getDashboardSessionFocus(workflow);
  const { knownUnreviewedTrades } = reviewCounts(workflow);
  const items: DashboardAgendaItem[] = [];
  const dataIssues = workflow.accountIssues.length + workflow.alertIssues.length;
  const firstSymbol = workflow.prioritySymbols?.[0] ?? null;

  if (dataIssues > 0) {
    items.push({
      id: "data",
      label: "1",
      title: "Confirm data health",
      detail: `${plural(dataIssues, "service")} need recovery before trusting workflow counts.`,
      href: "/data",
      tone: "warn",
    });
  }

  if (workflow.alertMatchSymbols > 0) {
    items.push({
      id: "alerts",
      label: String(items.length + 1),
      title: "Triage scan alerts",
      detail: `${plural(workflow.alertMatchSymbols, "matched symbol")} from active saved scans.`,
      href: "/alerts",
      tone: "action",
    });
  }

  if (firstSymbol) {
    items.push({
      id: "symbol",
      label: String(items.length + 1),
      title: `Review ${firstSymbol.symbol}`,
      detail: `${firstSymbol.label}: ${firstSymbol.reason}.`,
      href: firstSymbol.chartHref,
      tone: "action",
    });
  }

  if (workflow.watchlistReviewDue > 0) {
    items.push({
      id: "watchlist",
      label: String(items.length + 1),
      title: "Clean watchlist context",
      detail: `${plural(workflow.watchlistReviewDue, "symbol")} need notes or review-later cleanup.`,
      href: "/watchlist",
      tone: "action",
    });
  }

  if (knownUnreviewedTrades > 0) {
    items.push({
      id: "journal",
      label: String(items.length + 1),
      title: "Capture journal lessons",
      detail: workflow.reviewCoveragePartial === true
        ? `${plural(knownUnreviewedTrades, "loaded closed trade")} need review notes.`
        : `${plural(knownUnreviewedTrades, "closed trade")} need review notes.`,
      href: "/journal?review=needs-review",
      tone: "action",
    });
  }

  if ((workflow.openTrades ?? 0) > 0) {
    items.push({
      id: "open-risk",
      label: String(items.length + 1),
      title: "Check open risk",
      detail: `${plural(workflow.openTrades ?? 0, "open plan")} need stop, target, and invalidation checks.`,
      href: "/watchlist",
      tone: "action",
    });
  }

  if (workflow.brokerConnected === false) {
    items.push({
      id: "import",
      label: String(items.length + 1),
      title: "Connect read-only import",
      detail: "Execution history may be incomplete until broker import is connected.",
      href: "/settings/broker",
      tone: "warn",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "scanner",
      label: "1",
      title: "Run discovery scan",
      detail: workflow.scanAlerts > 0 ? "Saved scans are armed; review fresh matches after EOD." : "Start from a saved scanner preset to create the next candidate list.",
      href: "/scanner",
      tone: workflow.scanAlerts > 0 ? "ready" : "empty",
    });
  }

  return {
    headline: focus.headline,
    detail: focus.detail,
    items: items.slice(0, 5),
    primaryItem: items[0],
  };
}
