import type { DataHealth, JournalAnalytics, JournalStats } from "@/lib/api/types";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

export type DashboardRiskTone = "ready" | "action" | "warn" | "empty";

export type DashboardRiskMetric = {
  label: string;
  value: string;
  detail: string;
  tone: DashboardRiskTone;
};

export type DashboardRiskGuardrail = {
  id: "data" | "review" | "edge" | "loss" | "open-risk" | "import" | "ready";
  label: string;
  detail: string;
  href: string;
  tone: DashboardRiskTone;
};

export type DashboardRiskControlInput = {
  stats: JournalStats | null;
  analytics: JournalAnalytics | null;
  closedTrades: number;
  reviewedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  openTrades: number;
  marketDataStatus: DataHealth["status"] | null;
  accountIssueCount: number;
  alertIssueCount: number;
  brokerConnected: boolean;
};

export type DashboardRiskControl = {
  status: DashboardRiskTone;
  score: number;
  headline: string;
  summary: string;
  metrics: DashboardRiskMetric[];
  guardrails: DashboardRiskGuardrail[];
  primaryAction: DashboardRiskGuardrail;
};

function finite(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(value: number | null | undefined) {
  const n = finite(value);
  return n == null ? "—" : n.toFixed(2);
}

function percent(value: number | null | undefined) {
  const n = finite(value);
  return n == null ? "—" : `${n.toFixed(0)}%`;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneForScore(score: number): DashboardRiskTone {
  if (score >= 76) return "ready";
  if (score >= 52) return "action";
  return "warn";
}

export function buildDashboardRiskControl(input: DashboardRiskControlInput): DashboardRiskControl {
  const closedTrades = Math.max(0, input.closedTrades);
  const reviewedTrades = Math.min(closedTrades, Math.max(0, input.reviewedTrades));
  const unreviewedTrades = Math.max(
    0,
    input.knownUnreviewedTrades ?? closedTrades - reviewedTrades,
  );
  const dataNeedsCheck = input.accountIssueCount > 0 ||
    input.alertIssueCount > 0 ||
    input.marketDataStatus === "degraded" ||
    input.marketDataStatus === "stale";
  const profitFactor = finite(input.analytics?.profit_factor);
  const recoveryFactor = finite(input.analytics?.recovery_factor);
  const maxDrawdown = finite(input.analytics?.max_drawdown);
  const avgWin = finite(input.stats?.avg_win);
  const avgLoss = finite(input.stats?.avg_loss);
  const winRate = finite(input.stats?.win_rate);
  const payoffRatio = avgWin != null && avgWin > 0 && avgLoss != null && avgLoss < 0
    ? avgWin / Math.abs(avgLoss)
    : null;
  const reviewCoverage = closedTrades > 0 && input.reviewCoveragePartial !== true
    ? (reviewedTrades / closedTrades) * 100
    : null;

  let score = closedTrades > 0 ? 70 : 24;
  if (dataNeedsCheck) score -= input.accountIssueCount > 0 ? 24 : 12;
  if (profitFactor != null) {
    if (profitFactor >= 2) score += 15;
    else if (profitFactor >= 1.4) score += 7;
    else if (profitFactor >= 1) score -= 8;
    else score -= 24;
  }
  if (payoffRatio != null) {
    if (payoffRatio >= 2) score += 8;
    else if (payoffRatio >= 1.5) score += 3;
    else score -= 12;
  }
  if (winRate != null) {
    if (winRate >= 60) score += 5;
    else if (winRate < 45) score -= 8;
  }
  if (unreviewedTrades > 0) score -= Math.min(22, 6 + unreviewedTrades * 3);
  if (input.openTrades > 0) score -= Math.min(10, input.openTrades * 2);
  if (recoveryFactor != null && recoveryFactor < 1.5) score -= 10;
  const scoreValue = clampScore(score);

  const guardrails: DashboardRiskGuardrail[] = [];
  if (dataNeedsCheck) {
    guardrails.push({
      id: "data",
      label: "Data gate",
      detail: "Resolve data, alert, or account issues before adding new exposure.",
      href: "/data",
      tone: "warn",
    });
  }
  if (unreviewedTrades > 0) {
    guardrails.push({
      id: "review",
      label: "Review debt",
      detail: input.reviewCoveragePartial === true
        ? `${plural(unreviewedTrades, "loaded closed trade")} still need lessons captured.`
        : `${plural(unreviewedTrades, "closed trade")} still need lessons captured.`,
      href: "/journal",
      tone: "action",
    });
  }
  if (profitFactor != null && profitFactor < 1.4) {
    guardrails.push({
      id: "edge",
      label: "Edge quality",
      detail: "Profit factor is below the scale-up threshold; keep size controlled.",
      href: "/journal?tab=analytics",
      tone: "action",
    });
  }
  if (payoffRatio != null && payoffRatio < 1.5) {
    guardrails.push({
      id: "loss",
      label: "Loss size",
      detail: "Average win is not far enough above average loss for clean compounding.",
      href: "/journal?tab=analytics",
      tone: "action",
    });
  }
  if (input.openTrades > 0) {
    guardrails.push({
      id: "open-risk",
      label: "Open risk",
      detail: `${plural(input.openTrades, "open plan")} need stop, target, and invalidation checks.`,
      href: "/watchlist",
      tone: "action",
    });
  }
  if (!input.brokerConnected) {
    guardrails.push({
      id: "import",
      label: "Import gap",
      detail: "Read-only broker import is not connected, so execution history may be incomplete.",
      href: "/settings/broker",
      tone: "warn",
    });
  }

  if (guardrails.length === 0) {
    guardrails.push({
      id: "ready",
      label: "Size discipline",
      detail: "Risk metrics and review coverage are stable enough for normal planning.",
      href: "/journal?tab=analytics",
      tone: "ready",
    });
  }

  const status: DashboardRiskTone = closedTrades === 0
    ? "empty"
    : dataNeedsCheck
      ? "warn"
      : guardrails.some((item) => item.tone === "action")
        ? "action"
        : toneForScore(scoreValue);

  const headline = status === "empty"
    ? "Build a risk sample"
    : status === "warn"
      ? "Risk gate needs attention"
      : status === "action"
        ? "Process review due"
        : "Risk checks stable";
  const summary = status === "empty"
    ? "Close or import trades before trusting risk analytics."
    : status === "warn"
      ? "Fix data, import, or account gaps before sizing new trades."
      : status === "action"
        ? "Resolve active process guardrails before adding risk."
        : "Realised edge, drawdown, and review coverage are in a usable range.";

  return {
    status,
    score: scoreValue,
    headline,
    summary,
    metrics: [
      {
        label: "Profit factor",
        value: ratio(profitFactor),
        detail: profitFactor == null ? "Needs closed-trade analytics" : profitFactor >= 1.4 ? "Edge above caution line" : "Below caution line",
        tone: profitFactor == null ? "empty" : profitFactor >= 1.4 ? "ready" : "action",
      },
      {
        label: "Max drawdown",
        value: formatDashboardPnl(maxDrawdown),
        detail: input.analytics?.longest_dd_days ? `${input.analytics.longest_dd_days} day drawdown stretch` : "Drawdown window pending",
        tone: maxDrawdown == null ? "empty" : Math.abs(maxDrawdown) > Math.abs(input.stats?.total_pnl ?? 0) * 0.35 ? "action" : "ready",
      },
      {
        label: "Payoff ratio",
        value: payoffRatio == null ? "—" : `${payoffRatio.toFixed(2)}x`,
        detail: avgWin != null && avgLoss != null ? `${formatDashboardPnl(avgWin)} avg win / ${formatDashboardPnl(avgLoss)} avg loss` : "Needs win/loss split",
        tone: payoffRatio == null ? "empty" : payoffRatio >= 1.5 ? "ready" : "action",
      },
      {
        label: "Review coverage",
        value: input.reviewCoveragePartial === true
          ? (unreviewedTrades > 0 ? `${unreviewedTrades} due` : "Recent clear")
          : percent(reviewCoverage),
        detail: input.reviewCoveragePartial === true
          ? "Based on the loaded journal sample"
          : unreviewedTrades > 0 ? `${plural(unreviewedTrades, "trade")} unreviewed` : `${plural(reviewedTrades, "trade")} reviewed`,
        tone: closedTrades === 0 ? "empty" : unreviewedTrades > 0 ? "action" : "ready",
      },
    ],
    guardrails: guardrails.slice(0, 4),
    primaryAction: guardrails[0],
  };
}
