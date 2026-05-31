import type { WatchlistItem, WorkflowState } from "@/lib/api";

export type WatchlistTriageReviewState = {
  state: "reviewed" | "needs-review" | "new";
  closed?: number;
  reviewed?: number;
};

export type WatchlistTriageMeta = {
  pinned?: boolean;
  tags?: string[];
  note?: string | null;
};

export type WatchlistTriageSummary = {
  score: number;
  label: "Act now" | "Review next" | "Monitor" | "Archive check";
  reason: string;
  reasons: string[];
};

function finite(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000));
}

function freshnessScore(days: number | null): { score: number; reason: string | null } {
  if (days == null) return { score: 0, reason: null };
  if (days <= 2) return { score: 24, reason: "Fresh setup" };
  if (days <= 7) return { score: 14, reason: "Recent setup" };
  if (days <= 30) return { score: 6, reason: "Still current" };
  return { score: -6, reason: "Aged setup" };
}

function lifecycleScore(workflow: WorkflowState | null | undefined): { score: number; reason: string | null } {
  if (!workflow) return { score: 0, reason: null };
  if (workflow.ignored || workflow.lifecycle === "ignored") return { score: -90, reason: "Ignored" };
  if (workflow.lifecycle === "invalidated") return { score: -70, reason: "Invalidated" };
  if (workflow.lifecycle === "ready") return { score: 54, reason: "Plan ready" };
  if (workflow.lifecycle === "triggered") return { score: 50, reason: "Trigger hit" };
  if (workflow.review_later || workflow.lifecycle === "review_later") return { score: 28, reason: "Marked review later" };
  if (workflow.lifecycle === "idea") return { score: 24, reason: "Scanner idea" };
  if (workflow.lifecycle === "watch") return { score: 16, reason: "Watch setup" };
  if (workflow.lifecycle === "open") return { score: 8, reason: "Open position" };
  if (workflow.lifecycle === "reviewed") return { score: -8, reason: "Already reviewed" };
  return { score: 0, reason: null };
}

function marketSignalScore(item: WatchlistItem): { score: number; reasons: string[] } {
  const move = finite(item.pct_change);
  const volume = finite(item.volume_ratio);
  const rsi = finite(item.rsi_14);
  let score = 0;
  const reasons: string[] = [];

  if (move != null && move >= 2 && volume != null && volume >= 1.5) {
    score += 28;
    reasons.push("Price + volume");
  } else if (move != null && move > 0) {
    score += 8;
    reasons.push("Positive move");
  } else if (move != null && move <= -2 && volume != null && volume >= 1.3) {
    score -= 18;
    reasons.push("Heavy selloff");
  }

  if (volume != null && volume >= 2) {
    score += 16;
    reasons.push("Volume expansion");
  } else if (volume != null && volume >= 1.3) {
    score += 8;
    reasons.push("Volume building");
  }

  if (rsi != null && rsi >= 55 && rsi <= 72) {
    score += 12;
    reasons.push("Constructive RSI");
  } else if (rsi != null && rsi > 78) {
    score -= 8;
    reasons.push("Extended RSI");
  }

  return { score, reasons };
}

function labelForScore(score: number): WatchlistTriageSummary["label"] {
  if (score >= 135) return "Act now";
  if (score >= 88) return "Review next";
  if (score >= 44) return "Monitor";
  return "Archive check";
}

export function buildWatchlistTriageSummary(
  item: WatchlistItem,
  options: {
    workflow?: WorkflowState | null;
    reviewState?: WatchlistTriageReviewState | null;
    meta?: WatchlistTriageMeta | null;
    now?: Date;
  } = {},
): WatchlistTriageSummary {
  const workflow = options.workflow ?? null;
  const meta = options.meta ?? {};
  const reviewState = options.reviewState ?? null;
  const now = options.now ?? new Date();
  const scanner = workflow?.scanner_context ?? null;
  const reasons: string[] = [];
  let score = 0;

  if (meta.pinned) {
    score += 70;
    reasons.push("Pinned");
  }

  const lifecycle = lifecycleScore(workflow);
  score += lifecycle.score;
  if (lifecycle.reason) reasons.push(lifecycle.reason);

  const setupScore = finite(scanner?.setup_score);
  if (setupScore != null) {
    score += Math.round(setupScore * 0.45);
    reasons.push(`${scanner?.setup_grade ? `${scanner.setup_grade} ` : ""}${setupScore} scanner score`);
  } else if (workflow?.setup_quality != null) {
    score += workflow.setup_quality * 12;
    reasons.push(`Quality ${workflow.setup_quality}/5`);
  }

  if (workflow?.confidence != null) {
    score += workflow.confidence * 8;
    reasons.push(`Confidence ${workflow.confidence}/5`);
  }

  const market = marketSignalScore(item);
  score += market.score;
  reasons.push(...market.reasons);

  if (reviewState?.state === "needs-review") {
    score += 24;
    reasons.push("Closed trade needs review");
  } else if (reviewState?.state === "reviewed") {
    score -= 6;
    reasons.push("Review covered");
  }

  const freshness = freshnessScore(daysSince(scanner?.captured_at ?? workflow?.updated_at ?? item.added_at, now));
  score += freshness.score;
  if (freshness.reason) reasons.push(freshness.reason);

  if (!meta.note?.trim()) {
    score += 10;
    reasons.push("Needs note");
  }
  if ((meta.tags?.length ?? 0) > 0) {
    score += 5;
    reasons.push("Tagged");
  }

  const uniqueReasons = Array.from(new Set(reasons)).slice(0, 6);
  return {
    score,
    label: labelForScore(score),
    reason: uniqueReasons[0] ?? "Manual watchlist order",
    reasons: uniqueReasons,
  };
}
