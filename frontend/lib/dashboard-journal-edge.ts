import type { AiPatterns, JournalAnalytics, JournalEntry, JournalStats } from "@/lib/api/types";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

export type DashboardJournalEdgeTone = "ready" | "action" | "warn" | "empty";

export type DashboardJournalEdgeInput = {
  stats: JournalStats | null;
  analytics: JournalAnalytics | null;
  patterns: AiPatterns | null;
  journalEntries: JournalEntry[];
  accountIssueCount: number;
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  openTrades: number;
  brokerConnected: boolean;
};

export type DashboardJournalEdgeItem = {
  id: "setup" | "review" | "plan" | "mistake" | "ai";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardJournalEdgeTone;
};

export type DashboardJournalSetup = {
  setup: string;
  trades: number;
  winRate: number;
  pnl: number;
  tone: DashboardJournalEdgeTone;
};

export type DashboardJournalEdge = {
  tone: DashboardJournalEdgeTone;
  headline: string;
  summary: string;
  primaryAction: DashboardJournalEdgeItem;
  items: DashboardJournalEdgeItem[];
  setups: DashboardJournalSetup[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function toneRank(tone: DashboardJournalEdgeTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function setupTone(winRate: number, pnl: number): DashboardJournalEdgeTone {
  if (pnl < 0 || winRate < 45) return "warn";
  if (winRate < 55) return "action";
  return "ready";
}

function sortedSetups(analytics: JournalAnalytics | null): DashboardJournalSetup[] {
  return (analytics?.setup_breakdown ?? [])
    .map((setup) => ({
      setup: setup.setup || "Unclassified",
      trades: Math.max(0, setup.trades),
      winRate: finite(setup.win_rate) ?? 0,
      pnl: finite(setup.total_pnl) ?? 0,
      tone: setupTone(finite(setup.win_rate) ?? 0, finite(setup.total_pnl) ?? 0),
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 3);
}

function planCompleteness(entries: JournalEntry[]) {
  const openEntries = entries.filter((entry) => entry.status === "open");
  if (openEntries.length === 0) return { openEntries, complete: 0, total: 0, pct: null as number | null };
  const complete = openEntries.filter((entry) => (
    entry.stop_loss != null &&
    entry.target_price != null &&
    Boolean(entry.thesis?.trim() || entry.entry_reason?.trim()) &&
    Boolean(entry.invalidation_rule?.trim())
  )).length;
  return { openEntries, complete, total: openEntries.length, pct: Math.round((complete / openEntries.length) * 100) };
}

function mistakeCapture(entries: JournalEntry[]) {
  const closedEntries = entries.filter((entry) => entry.status === "closed");
  const withMistakes = closedEntries.filter((entry) => Boolean(entry.mistakes?.trim())).length;
  const withLessons = closedEntries.filter((entry) => Boolean(entry.lessons?.trim())).length;
  return { closedEntries, withMistakes, withLessons };
}

export function buildDashboardJournalEdge(input: DashboardJournalEdgeInput): DashboardJournalEdge {
  const closedTrades = Math.max(0, input.closedTrades);
  const reviewedTrades = Math.min(closedTrades, Math.max(0, input.reviewedTrades));
  const knownUnreviewedTrades = Math.max(
    0,
    input.knownUnreviewedTrades ?? closedTrades - reviewedTrades,
  );
  const setupRows = sortedSetups(input.analytics);
  const bestSetup = setupRows[0] ?? null;
  const profitFactor = finite(input.analytics?.profit_factor);
  const plan = planCompleteness(input.journalEntries);
  const mistakes = mistakeCapture(input.journalEntries);
  const hasJournalIssue = input.accountIssueCount > 0;

  const setupItem: DashboardJournalEdgeItem = hasJournalIssue
    ? {
        id: "setup",
        label: "Setup edge",
        value: "Paused",
        detail: "Journal analytics could not be confirmed.",
        href: "/data",
        tone: "warn",
      }
    : closedTrades === 0
      ? {
          id: "setup",
          label: "Setup edge",
          value: "No sample",
          detail: "Close or import trades before setup quality can be measured.",
          href: "/journal",
          tone: "empty",
        }
      : bestSetup
        ? {
            id: "setup",
            label: "Setup edge",
            value: bestSetup.setup,
            detail: `${plural(bestSetup.trades, "trade")} · ${bestSetup.winRate.toFixed(0)}% win rate · ${formatDashboardPnl(bestSetup.pnl)}.`,
            href: "/journal?tab=analytics",
            tone: bestSetup.tone,
          }
        : {
            id: "setup",
            label: "Setup edge",
            value: profitFactor == null ? "Classify" : `${profitFactor.toFixed(2)} PF`,
            detail: "Add setup tags so the dashboard can separate edge from noise.",
            href: "/journal",
            tone: "action",
          };

  const reviewItem: DashboardJournalEdgeItem = knownUnreviewedTrades > 0
    ? {
        id: "review",
        label: "Review backlog",
        value: `${knownUnreviewedTrades} due`,
        detail: input.reviewCoveragePartial === true
          ? "Loaded closed trades need lessons; full-history debt may be larger."
          : `${reviewedTrades}/${closedTrades} closed trades have lessons captured.`,
        href: "/journal?review=needs-review",
        tone: "action",
      }
    : closedTrades === 0
      ? {
          id: "review",
          label: "Review backlog",
          value: "No closes",
          detail: "The review loop starts after the first closed trade.",
          href: "/journal",
          tone: "empty",
        }
      : {
          id: "review",
          label: "Review backlog",
          value: input.reviewCoveragePartial === true ? "Recent clear" : "Clear",
          detail: input.reviewCoveragePartial === true
            ? "Loaded sample has lessons; full-history coverage is not confirmed."
            : `${plural(closedTrades, "closed trade")} reviewed.`,
          href: "/journal?tab=analytics",
          tone: input.reviewCoveragePartial === true ? "action" : "ready",
        };

  const planItem: DashboardJournalEdgeItem = plan.total > 0
    ? {
        id: "plan",
        label: "Plan quality",
        value: `${plan.complete}/${plan.total}`,
        detail: plan.pct === 100
          ? "Open plans have stop, target, thesis, and invalidation context."
          : "Open trades need stop, target, thesis, and invalidation context.",
        href: "/watchlist",
        tone: plan.pct === 100 ? "ready" : "action",
      }
    : input.openTrades > 0
      ? {
          id: "plan",
          label: "Plan quality",
          value: `${input.openTrades} open`,
          detail: "Open-trade stats exist, but the loaded journal sample did not include plan details.",
          href: "/journal",
          tone: "action",
        }
      : {
          id: "plan",
          label: "Plan quality",
          value: "No open risk",
          detail: "No loaded open trades need plan checks right now.",
          href: "/journal",
          tone: closedTrades > 0 ? "ready" : "empty",
        };

  const mistakeItem: DashboardJournalEdgeItem = mistakes.closedEntries.length > 0
    ? {
        id: "mistake",
        label: "Mistake loop",
        value: `${mistakes.withMistakes}/${mistakes.closedEntries.length}`,
        detail: mistakes.withMistakes > 0
          ? `${plural(mistakes.withLessons, "lesson")} captured from the loaded closed-trade sample.`
          : "Tag mistakes on reviewed trades so repeated process errors become visible.",
        href: "/journal?review=needs-review",
        tone: mistakes.withMistakes > 0 && mistakes.withLessons >= mistakes.closedEntries.length ? "ready" : "action",
      }
    : {
        id: "mistake",
        label: "Mistake loop",
        value: "Pending",
        detail: "Mistake and lesson capture appears after closed trades load.",
        href: "/journal",
        tone: "empty",
      };

  const aiReady = input.patterns?.ready === true;
  const aiItem: DashboardJournalEdgeItem = aiReady
    ? {
        id: "ai",
        label: "AI review",
        value: "Ready",
        detail: input.patterns?.coaching_cards?.[0]?.detail ?? "Pattern review is ready from the current journal sample.",
        href: "/journal?tab=analytics",
        tone: "ready",
      }
    : {
        id: "ai",
        label: "AI review",
        value: input.patterns?.trades_available != null && input.patterns?.min_trades_required != null
          ? `${input.patterns.trades_available}/${input.patterns.min_trades_required}`
          : input.brokerConnected ? "Building" : "Import gap",
        detail: input.patterns?.min_trades_required
          ? "More reviewed trades are needed before AI pattern review is reliable."
          : input.brokerConnected
            ? "AI review needs more closed trades and lessons."
            : "Connect read-only import or add journal history to improve AI review quality.",
        href: input.brokerConnected ? "/journal" : "/settings/broker",
        tone: closedTrades >= 3 ? "action" : "empty",
      };

  const items = [setupItem, reviewItem, planItem, mistakeItem, aiItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? reviewItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardJournalEdgeTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Journal edge needs recovery"
    : tone === "action"
      ? "Journal review has work queued"
      : tone === "empty"
        ? "Build the journal sample"
        : "Journal edge is reviewable";
  const summary = tone === "warn"
    ? "Journal analytics are not trustworthy until account data recovers."
    : tone === "action"
      ? "Finish review notes, plan context, mistake tags, or setup classification before trusting performance conclusions."
      : tone === "empty"
        ? "Close or import enough trades to unlock setup quality, mistake patterns, and AI review."
        : "Setup quality, review coverage, plan context, and AI review are usable for dashboard decisions.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    setups: setupRows,
  };
}
