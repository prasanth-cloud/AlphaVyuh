import type { AiPatterns, JournalAnalytics, JournalStats } from "@/lib/api/types";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

export type DashboardPerformanceCoachTone = "ready" | "action" | "warn" | "empty";

export type DashboardPerformanceCoachInput = {
  stats: JournalStats | null;
  analytics: JournalAnalytics | null;
  patterns: AiPatterns | null;
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  journalIssueCount: number;
  brokerConnected: boolean;
};

export type DashboardPerformanceCoachItem = {
  id: "coach" | "leak" | "edge" | "risk" | "hold";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardPerformanceCoachTone;
};

export type DashboardPerformanceCoachInsight = {
  label: string;
  value: string;
  detail: string;
  tone: DashboardPerformanceCoachTone;
};

export type DashboardPerformanceCoach = {
  tone: DashboardPerformanceCoachTone;
  headline: string;
  summary: string;
  primaryAction: DashboardPerformanceCoachItem;
  items: DashboardPerformanceCoachItem[];
  insights: DashboardPerformanceCoachInsight[];
};

type AiCoachingCard = NonNullable<AiPatterns["coaching_cards"]>[number];

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function ratio(value: number | null | undefined) {
  const n = finite(value);
  return n == null ? "—" : n.toFixed(2);
}

function toneRank(tone: DashboardPerformanceCoachTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function toneForAiCard(card: AiCoachingCard): DashboardPerformanceCoachTone {
  if (card.tone === "loss" || card.tone === "warn" || card.tone === "accent") return "action";
  return "ready";
}

function actionCard(cards: AiCoachingCard[]) {
  return cards.find((card) => card.tone === "loss" || card.tone === "warn") ??
    cards.find((card) => card.tone === "accent") ??
    null;
}

function gainCard(cards: AiCoachingCard[]) {
  return cards.find((card) => card.tone === "gain") ?? null;
}

function bestSetup(analytics: JournalAnalytics | null, patterns: AiPatterns | null) {
  const setupRows = patterns?.setup_breakdown?.length
    ? patterns.setup_breakdown
    : analytics?.setup_breakdown ?? [];
  return [...setupRows]
    .map((setup) => ({
      setup: setup.setup || "Unclassified",
      trades: Math.max(0, setup.trades),
      winRate: finite(setup.win_rate) ?? 0,
      pnl: finite(setup.total_pnl) ?? 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)[0] ?? null;
}

function worstDirection(patterns: AiPatterns | null) {
  return [...(patterns?.by_direction ?? [])]
    .map((row) => ({
      direction: row.direction || "direction",
      trades: Math.max(0, row.trades),
      winRate: finite(row.win_rate) ?? 0,
      pnl: finite(row.total_pnl) ?? 0,
    }))
    .sort((a, b) => a.pnl - b.pnl)[0] ?? null;
}

function holdLabel(patterns: AiPatterns | null) {
  const winners = finite(patterns?.avg_hold_winners);
  const losers = finite(patterns?.avg_hold_losers);
  if (winners == null || losers == null) return null;
  return {
    value: `${winners.toFixed(0)}d / ${losers.toFixed(0)}d`,
    detail: `Average winner hold vs loser hold from reviewed history.`,
    tone: winners >= losers ? "ready" as const : "action" as const,
  };
}

export function buildDashboardPerformanceCoach(
  input: DashboardPerformanceCoachInput,
): DashboardPerformanceCoach {
  const closedTrades = Math.max(0, input.closedTrades);
  const reviewedTrades = Math.min(closedTrades, Math.max(0, input.reviewedTrades));
  const unreviewedTrades = Math.max(
    0,
    input.knownUnreviewedTrades ?? closedTrades - reviewedTrades,
  );
  const minTrades = Math.max(0, input.patterns?.min_trades_required ?? 10);
  const tradesAvailable = Math.max(0, input.patterns?.trades_available ?? input.patterns?.total_trades ?? reviewedTrades);
  const cards = input.patterns?.coaching_cards ?? [];
  const nextAction = actionCard(cards);
  const bestAiCard = gainCard(cards);
  const setup = bestSetup(input.analytics, input.patterns);
  const weakDirection = worstDirection(input.patterns);
  const hold = holdLabel(input.patterns);
  const profitFactor = finite(input.analytics?.profit_factor);
  const recoveryFactor = finite(input.analytics?.recovery_factor);
  const ready = input.patterns?.ready === true;
  const journalUnavailable = input.journalIssueCount > 0;

  const coachItem: DashboardPerformanceCoachItem = journalUnavailable
    ? {
        id: "coach",
        label: "AI coach",
        value: "Unavailable",
        detail: "Journal analytics could not be confirmed, so coaching is paused.",
        href: "/data",
        tone: "warn",
      }
    : ready
      ? {
          id: "coach",
          label: "AI coach",
          value: "Ready",
          detail: cards.length > 0
            ? `${plural(cards.length, "coaching card")} generated from the reviewed trade sample.`
            : "Pattern review is ready; add more tagged history to expand coaching cards.",
          href: "/journal?tab=analytics",
          tone: nextAction ? "action" : "ready",
        }
      : closedTrades === 0
        ? {
            id: "coach",
            label: "AI coach",
            value: "No sample",
            detail: "Close, import, or review trades before coaching can be useful.",
            href: input.brokerConnected ? "/journal" : "/settings/broker",
            tone: "empty",
          }
        : {
            id: "coach",
            label: "AI coach",
            value: `${tradesAvailable}/${minTrades}`,
            detail: "More reviewed trades are needed before pattern coaching is decision-grade.",
            href: "/journal",
            tone: "action",
          };

  const leakItem: DashboardPerformanceCoachItem = journalUnavailable
    ? {
        id: "leak",
        label: "Process leak",
        value: "Paused",
        detail: "Restore journal analytics before diagnosing behavior leaks.",
        href: "/data",
        tone: "warn",
      }
    : nextAction
      ? {
          id: "leak",
          label: "Process leak",
          value: nextAction.value,
          detail: nextAction.detail,
          href: "/journal?review=needs-review",
          tone: toneForAiCard(nextAction),
        }
      : weakDirection && weakDirection.trades > 0 && weakDirection.pnl < 0
        ? {
            id: "leak",
            label: "Process leak",
            value: weakDirection.direction,
            detail: `${plural(weakDirection.trades, "trade")} · ${weakDirection.winRate.toFixed(0)}% win rate · ${formatDashboardPnl(weakDirection.pnl)}.`,
            href: "/journal?tab=analytics",
            tone: "action",
          }
        : {
            id: "leak",
            label: "Process leak",
            value: ready ? "None flagged" : "Pending",
            detail: ready ? "No negative coaching card is leading the current sample." : "Behavior leaks appear after AI pattern review is ready.",
            href: "/journal?tab=analytics",
            tone: ready ? "ready" : "empty",
          };

  const edgeItem: DashboardPerformanceCoachItem = bestAiCard
    ? {
        id: "edge",
        label: "Best edge",
        value: bestAiCard.value,
        detail: bestAiCard.detail,
        href: "/journal?tab=analytics",
        tone: "ready",
      }
    : setup
      ? {
          id: "edge",
          label: "Best edge",
          value: setup.setup,
          detail: `${plural(setup.trades, "trade")} · ${setup.winRate.toFixed(0)}% win rate · ${formatDashboardPnl(setup.pnl)}.`,
          href: "/journal?tab=analytics",
          tone: setup.pnl >= 0 && setup.winRate >= 55 ? "ready" : "action",
        }
      : {
          id: "edge",
          label: "Best edge",
          value: "Unclassified",
          detail: "Tag setup type on journal entries to separate edge from random outcomes.",
          href: "/journal",
          tone: closedTrades > 0 ? "action" : "empty",
        };

  const riskItem: DashboardPerformanceCoachItem = {
    id: "risk",
    label: "Risk discipline",
    value: profitFactor != null ? `${ratio(profitFactor)} PF` : "Pending",
    detail: profitFactor == null
      ? "Profit factor appears after enough closed-trade analytics are available."
      : recoveryFactor != null
        ? `${ratio(recoveryFactor)} recovery factor from the current journal sample.`
        : "Recovery factor pending; keep reviewing drawdown behavior.",
    href: "/journal?tab=analytics",
    tone: profitFactor == null ? "empty" : profitFactor >= 1.4 ? "ready" : "action",
  };

  const holdItem: DashboardPerformanceCoachItem = hold
    ? {
        id: "hold",
        label: "Hold behavior",
        value: hold.value,
        detail: hold.detail,
        href: "/journal?tab=analytics",
        tone: hold.tone,
      }
    : {
        id: "hold",
        label: "Hold behavior",
        value: "Pending",
        detail: "Winner vs loser holding-time behavior appears after AI review has enough history.",
        href: "/journal",
        tone: closedTrades > 0 ? "action" : "empty",
      };

  const items = [coachItem, leakItem, edgeItem, riskItem, holdItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? coachItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action") || unreviewedTrades > 0;
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardPerformanceCoachTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Performance coaching is gated"
    : tone === "action"
      ? "One improvement loop is active"
      : tone === "empty"
        ? "Build the coaching sample"
        : "Performance coach is clear";
  const summary = tone === "warn"
    ? "Restore journal analytics before trusting coaching, edge, or risk insights."
    : tone === "action"
      ? "Use the leading leak, edge, risk, and hold-time signals to focus the next review session."
      : tone === "empty"
        ? "Import or close reviewed trades so AlphaVyuh can move from tracking to coaching."
        : "Current journal sample has AI coaching, edge, risk, and hold behavior in a usable state.";

  const insights = cards.slice(0, 3).map<DashboardPerformanceCoachInsight>((card) => ({
    label: card.label,
    value: card.value,
    detail: card.detail,
    tone: toneForAiCard(card),
  }));

  if (insights.length === 0 && unreviewedTrades > 0) {
    insights.push({
      label: "Review backlog",
      value: `${unreviewedTrades} due`,
      detail: input.reviewCoveragePartial === true
        ? "Loaded closed trades need lessons; full-history coaching may be incomplete."
        : `${plural(unreviewedTrades, "closed trade")} need lessons before coaching is reliable.`,
      tone: "action",
    });
  }

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    insights,
  };
}
