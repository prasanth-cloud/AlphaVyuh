export type DashboardWorkflowInput = {
  accountIssues: { id: string }[];
  alertIssues: { id: string }[];
  closedTrades: number;
  reviewedTrades: number;
  watchlistReviewDue: number;
  alertMatchSymbols: number;
  scanAlerts: number;
  trackedSymbols: number;
  watchlists: number;
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

export function getDashboardSessionFocus(workflow: DashboardWorkflowInput): DashboardSessionFocus {
  const reviewDue = Math.max(0, workflow.closedTrades - workflow.reviewedTrades);
  const reviewCoverage = workflow.closedTrades > 0
    ? Math.round((workflow.reviewedTrades / workflow.closedTrades) * 100)
    : 0;
  const journalIssue = workflow.accountIssues.some((issue) => issue.id === "journal");
  const watchlistIssue = workflow.accountIssues.some((issue) => issue.id === "watchlists");
  const alertsIssue = workflow.alertIssues.length > 0;

  if (workflow.accountIssues.length > 0) {
    return {
      headline: "Account data needs a check",
      detail: "Workflow counts are paused until services respond. Open Data Status before changing watchlists or journal entries.",
      primaryLabel: "Open Data Status",
      primaryHref: "/data",
      streakLabel: "Review coverage",
      streakValue: journalIssue ? "Paused" : `${reviewCoverage}%`,
      streakDetail: journalIssue ? "Journal stats unavailable" : `${workflow.reviewedTrades} of ${workflow.closedTrades} closed trades reviewed`,
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
      streakValue: `${reviewCoverage}%`,
      streakDetail: `${workflow.reviewedTrades} reviewed · ${reviewDue} waiting`,
      streakTone: reviewCoverage >= 70 ? "gain" : "warn",
    };
  }

  if (!watchlistIssue && workflow.watchlistReviewDue > 0) {
    return {
      headline: `${workflow.watchlistReviewDue} watchlist symbol${workflow.watchlistReviewDue === 1 ? "" : "s"} need context`,
      detail: "Add notes or clear review-later flags before the queue goes stale.",
      primaryLabel: "Open watchlist queue",
      primaryHref: "/watchlist",
      streakLabel: "Review streak",
      streakValue: "Clear",
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
      streakValue: `${reviewCoverage}%`,
      streakDetail: "Journal review queue is clear",
      streakTone: reviewCoverage >= 70 ? "gain" : "accent",
    };
  }

  if (workflow.closedTrades < 3) {
    const remaining = 3 - workflow.closedTrades;
    return {
      headline: remaining === 3 ? "Build your first review sample" : `${remaining} more close${remaining === 1 ? "" : "s"} to unlock patterns`,
      detail: "Close three trades with review notes before journal-wide coaching becomes useful.",
      primaryLabel: workflow.closedTrades === 0 ? "Log first trade" : "Open journal",
      primaryHref: "/journal",
      streakLabel: "Closed trades",
      streakValue: String(workflow.closedTrades),
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
      streakValue: `${reviewCoverage}%`,
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
      streakValue: `${reviewCoverage}%`,
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
    streakValue: `${reviewCoverage}%`,
    streakDetail: `${workflow.reviewedTrades} of ${workflow.closedTrades} closed trades reviewed`,
    streakTone: reviewCoverage >= 70 ? "gain" : "accent",
  };
}
