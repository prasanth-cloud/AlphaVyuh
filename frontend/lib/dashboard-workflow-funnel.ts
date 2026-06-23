import type { JournalEntry, WorkflowState } from "@/lib/api/types";

export type DashboardWorkflowFunnelTone = "ready" | "action" | "warn" | "empty";

export type DashboardWorkflowFunnelInput = {
  workflowStates: WorkflowState[];
  journalEntries: JournalEntry[];
  trackedSymbols: number;
  watchlists: number;
  watchlistReviewDue: number;
  alertMatchSymbols: number;
  scanAlerts: number;
  openTrades: number;
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  accountIssueCount: number;
  alertIssueCount: number;
};

export type DashboardWorkflowFunnelStep = {
  id: "discovery" | "watchlist" | "plan" | "open" | "closed" | "reviewed";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardWorkflowFunnelTone;
};

export type DashboardWorkflowFunnel = {
  tone: DashboardWorkflowFunnelTone;
  headline: string;
  summary: string;
  primaryStep: DashboardWorkflowFunnelStep;
  steps: DashboardWorkflowFunnelStep[];
  conversionLabel: string;
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardWorkflowFunnelTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function activeWorkflowStates(states: WorkflowState[]) {
  return states.filter((state) => !state.ignored && state.lifecycle !== "ignored");
}

function plannedStates(states: WorkflowState[]) {
  return activeWorkflowStates(states).filter((state) => (
    state.lifecycle === "ready" ||
    state.lifecycle === "triggered" ||
    state.lifecycle === "open" ||
    Boolean(state.entry) ||
    Boolean(state.stop) ||
    Boolean(state.target) ||
    Boolean(state.thesis?.trim()) ||
    Boolean(state.invalidation_rule?.trim())
  ));
}

function reviewedJournalEntries(entries: JournalEntry[]) {
  return entries.filter((entry) => entry.status === "closed" && Boolean(entry.lessons?.trim()));
}

export function buildDashboardWorkflowFunnel(input: DashboardWorkflowFunnelInput): DashboardWorkflowFunnel {
  const activeStates = activeWorkflowStates(input.workflowStates);
  const planned = plannedStates(input.workflowStates);
  const closedTrades = Math.max(0, input.closedTrades);
  const unreviewedTrades = Math.max(0, input.knownUnreviewedTrades ?? closedTrades - input.reviewedTrades);
  const reviewedTrades = input.reviewCoveragePartial === true
    ? Math.max(0, closedTrades - unreviewedTrades)
    : Math.min(closedTrades, Math.max(0, input.reviewedTrades, reviewedJournalEntries(input.journalEntries).length));
  const dataBlocked = input.accountIssueCount > 0 || input.alertIssueCount > 0;
  const discoveryCount = Math.max(input.alertMatchSymbols, input.scanAlerts, activeStates.length);

  const discoveryStep: DashboardWorkflowFunnelStep = dataBlocked
    ? {
        id: "discovery",
        label: "Discover",
        value: "Blocked",
        detail: "Data or alert evidence is unavailable, so discovery cannot be trusted.",
        href: input.alertIssueCount > 0 ? "/alerts" : "/data",
        tone: "warn",
      }
    : input.alertMatchSymbols > 0
      ? {
          id: "discovery",
          label: "Discover",
          value: plural(input.alertMatchSymbols, "match", "matches"),
          detail: "Scan alerts produced symbols that need triage.",
          href: "/alerts",
          tone: "action",
        }
      : input.scanAlerts > 0 || activeStates.length > 0
        ? {
            id: "discovery",
            label: "Discover",
            value: input.scanAlerts > 0 ? plural(input.scanAlerts, "armed scan") : plural(activeStates.length, "idea"),
            detail: "Discovery is active; keep the queue moving into watchlist review.",
            href: input.scanAlerts > 0 ? "/alerts" : "/scanner",
            tone: "ready",
          }
        : {
            id: "discovery",
            label: "Discover",
            value: "No queue",
            detail: "Run a scanner preset or save scan alerts to start the workflow.",
            href: "/scanner",
            tone: "empty",
          };

  const watchlistStep: DashboardWorkflowFunnelStep = input.watchlists === 0 || input.trackedSymbols === 0
    ? {
        id: "watchlist",
        label: "Focus",
        value: input.watchlists === 0 ? "No list" : "No symbols",
        detail: "Build one focused watchlist before chart planning.",
        href: input.watchlists === 0 ? "/watchlist" : "/scanner",
        tone: "empty",
      }
    : input.watchlistReviewDue > 0
      ? {
          id: "watchlist",
          label: "Focus",
          value: `${input.watchlistReviewDue} due`,
          detail: `${plural(input.trackedSymbols, "symbol")} tracked; notes or review-later flags need cleanup.`,
          href: "/watchlist",
          tone: "action",
        }
      : {
          id: "watchlist",
          label: "Focus",
          value: `${input.trackedSymbols} tracked`,
          detail: "Watchlist context is ready for chart planning.",
          href: "/watchlist",
          tone: "ready",
        };

  const planStep: DashboardWorkflowFunnelStep = planned.length === 0
    ? {
        id: "plan",
        label: "Plan",
        value: "No plans",
        detail: input.trackedSymbols > 0
          ? "Turn watchlist symbols into chart plans with entry, stop, target, and thesis."
          : "A watchlist queue is needed before chart planning.",
        href: input.trackedSymbols > 0 ? "/watchlist" : "/scanner",
        tone: input.trackedSymbols > 0 ? "action" : "empty",
      }
    : {
        id: "plan",
        label: "Plan",
        value: plural(planned.length, "plan"),
        detail: `${plural(activeStates.length, "active idea")} in workflow; planned symbols are ready for risk checks.`,
        href: "/watchlist",
        tone: "ready",
      };

  const openStep: DashboardWorkflowFunnelStep = input.openTrades > 0
    ? {
        id: "open",
        label: "Manage",
        value: plural(input.openTrades, "open"),
        detail: "Open plans need stop, target, event, and invalidation checks.",
        href: "/watchlist",
        tone: "action",
      }
    : planned.length > 0
      ? {
          id: "open",
          label: "Manage",
          value: "No open risk",
          detail: "Plans are waiting; only act when risk rules are satisfied.",
          href: "/watchlist",
          tone: "ready",
        }
      : {
          id: "open",
          label: "Manage",
          value: "No exposure",
          detail: "No open risk exists because no plan has moved forward yet.",
          href: "/watchlist",
          tone: "empty",
        };

  const closedStep: DashboardWorkflowFunnelStep = closedTrades === 0
    ? {
        id: "closed",
        label: "Close",
        value: "No sample",
        detail: "Close or import trades before outcome quality can be measured.",
        href: "/journal",
        tone: input.openTrades > 0 ? "action" : "empty",
      }
    : {
        id: "closed",
        label: "Close",
        value: plural(closedTrades, "trade"),
        detail: "Closed trades are available for outcome review.",
        href: "/journal",
        tone: "ready",
      };

  const reviewedStep: DashboardWorkflowFunnelStep = closedTrades === 0
    ? {
        id: "reviewed",
        label: "Review",
        value: "Pending",
        detail: "Lessons appear after closed trades are reviewed.",
        href: "/journal",
        tone: "empty",
      }
    : unreviewedTrades > 0
      ? {
          id: "reviewed",
          label: "Review",
          value: `${unreviewedTrades} due`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded closed trades still need lessons."
            : `${reviewedTrades}/${closedTrades} closed trades have lessons.`,
          href: "/journal?review=needs-review",
          tone: "action",
        }
      : {
          id: "reviewed",
          label: "Review",
          value: input.reviewCoveragePartial === true ? "Recent clear" : `${reviewedTrades}/${closedTrades}`,
          detail: "Closed trade lessons are current enough for performance review.",
          href: "/journal?tab=analytics",
          tone: "ready",
        };

  const steps = [discoveryStep, watchlistStep, planStep, openStep, closedStep, reviewedStep];
  const primaryStep = [...steps].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? discoveryStep;
  const hasWarn = steps.some((step) => step.tone === "warn");
  const hasAction = steps.some((step) => step.tone === "action");
  const hasEmpty = steps.some((step) => step.tone === "empty");
  const tone: DashboardWorkflowFunnelTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Workflow funnel is blocked"
    : tone === "action"
      ? "Workflow has a bottleneck"
      : tone === "empty"
        ? "Start the trading loop"
        : "Workflow is moving";
  const summary = tone === "warn"
    ? "Resolve data or alert availability before trusting funnel conversion."
    : tone === "action"
      ? `${primaryStep.label} is the next bottleneck to clear before the workflow moves cleanly.`
      : tone === "empty"
        ? "Run scanner, build a focus list, plan the chart, and journal outcomes."
        : "Discovery, focus, planning, risk, closes, and review are connected.";
  const conversionLabel = closedTrades > 0 && reviewedTrades > 0
    ? `${Math.round((reviewedTrades / closedTrades) * 100)}% close-to-review`
    : closedTrades > 0 && discoveryCount > 0
      ? `${closedTrades} closed · ${discoveryCount} current discoveries`
      : closedTrades > 0
        ? `${closedTrades} closed · review pending`
        : `${planned.length}/${Math.max(1, input.trackedSymbols)} planned`;

  return {
    tone,
    headline,
    summary,
    primaryStep,
    steps,
    conversionLabel,
  };
}
