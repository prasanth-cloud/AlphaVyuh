import type { JournalEntry, Watchlist, WorkflowState } from "@/lib/api/types";
import { isCompletedProcessReview } from "@/lib/journal-weekly-review";
import { buildWatchlistTriageSummary, type WatchlistTriageBrokerContext } from "@/lib/watchlist-triage";

export type DashboardBriefStatus = "ready" | "action" | "warn" | "empty";

export type DashboardBriefItem = {
  id: "market" | "scanner" | "watchlist" | "risk" | "journal" | "import";
  label: string;
  value: string;
  detail: string;
  href: string;
  status: DashboardBriefStatus;
};

export type DashboardActionBriefInput = {
  tradeDate: string | null;
  marketPhase: string | null;
  marketDataStatus: "healthy" | "degraded" | "stale" | "unknown" | null;
  marketDataMode?: string | null;
  marketRefreshFailed?: boolean;
  trackedSymbols: number;
  watchlistReviewDue: number;
  scanAlerts: number;
  alertMatchSymbols: number;
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  openTrades: number;
  brokerConnected: boolean;
  brokerName: string | null;
  brokerStatusLabel: string | null;
  brokerLastSyncedAt: string | null;
  accountIssueCount: number;
  alertIssueCount: number;
  workflowLoading?: boolean;
  watchlistUnavailable?: boolean;
  workflowContextUnavailable?: boolean;
  journalUnavailable?: boolean;
  brokerUnavailable?: boolean;
  prioritySymbols?: DashboardPrioritySymbol[];
};

export type DashboardActionBrief = {
  readyCount: number;
  totalCount: number;
  headline: string;
  nextAction: DashboardBriefItem;
  items: DashboardBriefItem[];
  prioritySymbols: DashboardPrioritySymbol[];
};

export type DashboardPrioritySymbol = {
  symbol: string;
  companyName: string | null;
  watchlistId: string;
  watchlistName: string;
  label: string;
  score: number;
  reason: string;
  detail: string;
  href: string;
  chartHref: string;
};

export type DashboardPrioritySymbolInput = {
  watchlists: Watchlist[];
  workflowStates: WorkflowState[];
  journalEntries: JournalEntry[];
  broker?: WatchlistTriageBrokerContext | null;
  limit?: number;
  now?: Date;
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function formatDate(raw: string | null) {
  if (!raw) return "date pending";
  return raw;
}

export function buildDashboardActionBrief(input: DashboardActionBriefInput): DashboardActionBrief {
  const marketNeedsCheck = input.marketRefreshFailed === true ||
    input.marketDataStatus === "degraded" ||
    input.marketDataStatus === "stale";
  const market: DashboardBriefItem = {
    id: "market",
    label: "Market first",
    value: marketNeedsCheck ? "Check data" : input.marketPhase || "Market ready",
    detail: marketNeedsCheck
      ? "Market data needs review before planning new trades."
      : `${input.marketDataMode === "demo" ? "Demo" : "EOD"} breadth as of ${formatDate(input.tradeDate)}.`,
    href: marketNeedsCheck ? "/data" : "/dashboard",
    status: marketNeedsCheck ? "warn" : "ready",
  };

  const scanner: DashboardBriefItem = input.alertIssueCount > 0
    ? {
        id: "scanner",
        label: "Scanner queue",
        value: "Check alerts",
        detail: "Recent scan alert matches could not be loaded.",
        href: "/alerts",
        status: "warn",
      }
    : input.alertMatchSymbols > 0
      ? {
          id: "scanner",
          label: "Scanner queue",
          value: plural(input.alertMatchSymbols, "match", "matches"),
          detail: "Review symbols that matched active scan alerts before adding new names.",
          href: "/alerts",
          status: "action",
        }
      : input.scanAlerts > 0
        ? {
            id: "scanner",
            label: "Scanner queue",
            value: plural(input.scanAlerts, "alert"),
            detail: "Alerts are armed; run scanner after the latest EOD refresh.",
            href: "/scanner",
            status: "ready",
          }
        : {
            id: "scanner",
            label: "Scanner queue",
            value: "Run scan",
            detail: "Start with a saved screen or preset to create today's candidate list.",
            href: "/scanner",
            status: "empty",
          };

  const watchlist: DashboardBriefItem = input.watchlistUnavailable === true || input.workflowContextUnavailable === true
    ? {
        id: "watchlist",
        label: "Watchlist focus",
        value: "Unavailable",
        detail: input.watchlistUnavailable === true
          ? "Saved watchlists could not be loaded. Existing lists are not being treated as empty."
          : "Workflow context could not be loaded. Review status is unknown.",
        href: "/watchlist",
        status: "warn",
      }
    : input.trackedSymbols === 0
    ? {
        id: "watchlist",
        label: "Watchlist focus",
        value: "No symbols",
        detail: "Move scanner candidates into a focused watchlist before chart review.",
        href: "/scanner",
        status: "empty",
      }
    : input.watchlistReviewDue > 0
      ? {
          id: "watchlist",
          label: "Watchlist focus",
          value: `${input.watchlistReviewDue} due`,
          detail: `${plural(input.trackedSymbols, "symbol")} tracked; add notes or clear review-later flags.`,
          href: "/watchlist",
          status: "action",
        }
      : {
          id: "watchlist",
          label: "Watchlist focus",
          value: `${input.trackedSymbols} tracked`,
          detail: "Focus list is ready for chart and level planning.",
          href: "/watchlist",
          status: "ready",
        };

  const openRisk: DashboardBriefItem = input.journalUnavailable === true
    ? {
        id: "risk",
        label: "Open risk",
        value: "Unavailable",
        detail: "Open-position totals could not be confirmed. No flat state is being inferred.",
        href: "/journal",
        status: "warn",
      }
    : input.openTrades > 0
    ? {
        id: "risk",
        label: "Open risk",
        value: `${input.openTrades} open`,
        detail: "Check stop, target, and invalidation",
        href: "/journal?status=open",
        status: "action",
      }
    : {
        id: "risk",
        label: "Open risk",
        value: "Flat",
        detail: "No open plans in the loaded journal sample.",
        href: "/journal",
        status: "ready",
      };

  const unreviewedTrades = input.knownUnreviewedTrades ?? Math.max(0, input.closedTrades - input.reviewedTrades);
  const journal: DashboardBriefItem = input.journalUnavailable === true
    ? {
        id: "journal",
        label: "Journal learning",
        value: "Unavailable",
        detail: "Journal account evidence could not be fully loaded. Existing entries and reviews are not being treated as empty.",
        href: "/journal",
        status: "warn",
      }
    : input.closedTrades === 0
    ? {
        id: "journal",
        label: "Journal learning",
        value: input.openTrades > 0 ? `${input.openTrades} open` : "No closes",
        detail: input.openTrades > 0
          ? "Open plans are waiting for exit review before analytics can teach anything."
          : "Close or import trades to unlock process review.",
        href: "/journal",
        status: "empty",
      }
    : unreviewedTrades > 0
      ? {
          id: "journal",
          label: "Journal learning",
          value: `${unreviewedTrades} due`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded journal sample has closed trades that still need process review."
            : `${input.reviewedTrades}/${input.closedTrades} closed trades have process review recorded.`,
          href: "/journal?review=needs-review",
          status: "action",
        }
      : input.reviewCoveragePartial === true
        ? {
            id: "journal",
            label: "Journal learning",
            value: "Coverage partial",
            detail: "Loaded journal sample is reviewed; full-history review state is unknown.",
            href: "/journal?tab=analytics",
            status: "warn",
          }
        : {
          id: "journal",
          label: "Journal learning",
          value: "Reviewed",
          detail: `${input.closedTrades} closed trades have completed process reviews.`,
          href: "/journal?tab=analytics",
          status: "ready",
        };

  const brokerImport: DashboardBriefItem = input.brokerUnavailable === true
    ? {
        id: "import",
        label: "Import safety",
        value: "Unavailable",
        detail: "Broker import status could not be confirmed. Existing access is not being treated as disconnected.",
        href: "/settings/broker",
        status: "warn",
      }
    : input.brokerConnected
    ? {
        id: "import",
        label: "Import safety",
        value: input.brokerName || "Connected",
        detail: input.brokerLastSyncedAt
          ? `Read-only import last synced ${input.brokerLastSyncedAt}.`
          : input.brokerStatusLabel || "Read-only import is connected; execution remains disabled.",
        href: "/settings/broker",
        status: "ready",
      }
    : {
        id: "import",
        label: "Import safety",
        value: "Import not connected",
        detail: input.brokerStatusLabel || "Broker execution is disabled; connect read-only import when ready.",
        href: "/settings/broker",
        status: "warn",
      };

  const items = [market, scanner, watchlist, openRisk, journal, brokerImport];
  const nextAction = items.find((item) => item.status === "warn") ??
    items.find((item) => item.status === "action") ??
    items.find((item) => item.status === "empty") ??
    scanner;
  const readyCount = items.filter((item) => item.status === "ready").length;

  return {
    readyCount,
    totalCount: items.length,
    headline: `${readyCount}/${items.length} desk signals ready`,
    nextAction,
    items,
    prioritySymbols: (input.prioritySymbols ?? []).slice(0, 2),
  };
}

function reviewStateForSymbol(symbol: string, entries: JournalEntry[]) {
  const closed = entries.filter((entry) => entry.symbol.toUpperCase() === symbol && entry.status === "closed");
  if (closed.length === 0) return { state: "new" as const };
  const reviewed = closed.filter(isCompletedProcessReview);
  return {
    state: reviewed.length >= closed.length ? "reviewed" as const : "needs-review" as const,
    closed: closed.length,
    reviewed: reviewed.length,
  };
}

function visiblePriorityReasons(reasons: string[]) {
  const visible = reasons.slice(0, 3);
  for (const criticalReason of ["Closed trade needs review", "Broker reconnect needed", "Broker status check"]) {
    if (!reasons.includes(criticalReason) || visible.includes(criticalReason)) continue;
    if (visible.length < 3) {
      visible.push(criticalReason);
    } else {
      visible[visible.length - 1] = criticalReason;
    }
  }
  return visible;
}

export function buildDashboardPrioritySymbols({
  watchlists,
  workflowStates,
  journalEntries,
  broker,
  limit = 4,
  now,
}: DashboardPrioritySymbolInput): DashboardPrioritySymbol[] {
  const workflowBySymbol = new Map(
    workflowStates.map((state) => [state.symbol.toUpperCase(), state]),
  );
  const bestBySymbol = new Map<string, DashboardPrioritySymbol>();

  for (const watchlist of watchlists) {
    for (const item of watchlist.items ?? []) {
      const symbol = item.symbol.toUpperCase();
      const workflow = workflowBySymbol.get(symbol) ?? null;
      const summary = buildWatchlistTriageSummary(item, {
        workflow,
        broker,
        now,
        meta: {
          pinned: item.pinned,
          tags: item.tags,
          note: item.note,
        },
        reviewState: reviewStateForSymbol(symbol, journalEntries),
      });
      const reasons = visiblePriorityReasons(summary.reasons.filter((reason) => reason !== summary.reason));
      const candidate: DashboardPrioritySymbol = {
        symbol,
        companyName: item.company_name ?? null,
        watchlistId: watchlist.id,
        watchlistName: watchlist.name,
        label: summary.label,
        score: summary.score,
        reason: summary.reason,
        detail: reasons.length ? reasons.join(" · ") : "Manual watchlist order",
        href: `/watchlist?id=${encodeURIComponent(watchlist.id)}&symbol=${encodeURIComponent(symbol)}`,
        chartHref: `/charts/${encodeURIComponent(symbol)}?from=watchlist&watchlistId=${encodeURIComponent(watchlist.id)}&watchlist=${encodeURIComponent(watchlist.name)}&full=1`,
      };
      const current = bestBySymbol.get(symbol);
      if (!current || candidate.score > current.score) bestBySymbol.set(symbol, candidate);
    }
  }

  return Array.from(bestBySymbol.values())
    .filter((item) => item.label !== "Archive check")
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}
