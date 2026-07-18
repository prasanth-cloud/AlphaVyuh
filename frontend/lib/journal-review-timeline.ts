import type { JournalChartSnapshot, JournalEntry, JournalRuleBreakCode, SetupAdherence } from "@/lib/api/types";
import { isCompletedProcessReview, journalRuleBreakLabel } from "@/lib/journal-weekly-review";

export type JournalReviewTimelineStageId =
  | "plan"
  | "entry-context"
  | "outcome"
  | "adherence"
  | "adjustment";

export type JournalReviewTimelineStageState = "recorded" | "pending" | "missing" | "unavailable";

export type JournalReviewTimelineStage = {
  id: JournalReviewTimelineStageId;
  title: string;
  state: JournalReviewTimelineStageState;
  primary: string;
  details: string[];
  timestamp: string | null;
};

export type JournalReviewTimeline = {
  status: "complete" | "needs-review" | "in-progress";
  completedStages: number;
  totalStages: 5;
  stages: JournalReviewTimelineStage[];
};

function clean(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function formatCurrency(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const absolute = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}₹${absolute}`;
}

function formatOutcome(entry: JournalEntry): string {
  const pnl = formatCurrency(entry.pnl);
  if (pnl) return `${entry.pnl != null && entry.pnl >= 0 ? "Gain" : "Loss"} ${pnl}`;
  if (entry.exit_price != null) return `Closed at ${formatCurrency(entry.exit_price)}`;
  return "Closed outcome recorded without price details";
}

const ADHERENCE_LABELS: Record<SetupAdherence, string> = {
  followed: "Followed plan",
  partial: "Partly followed",
  not_followed: "Did not follow plan",
  not_applicable: "Not applicable",
};

function buildPlanStage(entry: JournalEntry): JournalReviewTimelineStage {
  const plannedSetup = clean(entry.planned_setup) ?? clean(entry.setup_type);
  const thesis = clean(entry.thesis);
  const invalidation = clean(entry.invalidation_rule);
  const primary = plannedSetup ?? thesis;
  const details = [
    plannedSetup && thesis ? `Thesis: ${thesis}` : null,
    invalidation ? `Invalidation: ${invalidation}` : null,
    entry.stop_loss != null ? `Stop ${formatCurrency(entry.stop_loss)}` : null,
    entry.target_price != null ? `Target ${formatCurrency(entry.target_price)}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return {
    id: "plan",
    title: "Plan",
    state: primary ? "recorded" : "missing",
    primary: primary ?? "Original plan was not recorded",
    details,
    timestamp: entry.entry_date || entry.created_at || null,
  };
}

function buildEntryContextStage(entry: JournalEntry, snapshot: JournalChartSnapshot | null): JournalReviewTimelineStage {
  if (snapshot?.available && snapshot.state) {
    const state = snapshot.state;
    const details = [
      state.indicators.length ? `Indicators: ${state.indicators.join(", ")}` : "Indicators: none recorded",
      `Drawings: ${state.drawings.length}`,
      `Source: ${state.data_source} · ${state.data_mode}`,
      state.data_as_of ? `Data as of ${state.data_as_of}` : null,
    ].filter((detail): detail is string => Boolean(detail));

    return {
      id: "entry-context",
      title: "Entry context",
      state: "recorded",
      primary: `${state.range_label} · ${state.timeframe} · ${state.chart_type}`,
      details,
      timestamp: state.captured_at,
    };
  }

  if (entry.snapshot_state_path) {
    return {
      id: "entry-context",
      title: "Entry context",
      state: "unavailable",
      primary: "Immutable entry context is unavailable",
      details: ["The journal record remains usable; no chart state is being inferred."],
      timestamp: entry.snapshot_captured_at ?? snapshot?.captured_at ?? null,
    };
  }

  return {
    id: "entry-context",
    title: "Entry context",
    state: "missing",
    primary: "Immutable entry context was not captured",
    details: [],
    timestamp: null,
  };
}

function buildOutcomeStage(entry: JournalEntry): JournalReviewTimelineStage {
  if (entry.status === "open") {
    return {
      id: "outcome",
      title: "Outcome",
      state: "pending",
      primary: "Trade remains open",
      details: [entry.quantity > 0 ? `${entry.quantity} shares at ${formatCurrency(entry.entry_price)}` : "Entry recorded"],
      timestamp: null,
    };
  }

  if (entry.status !== "closed") {
    return {
      id: "outcome",
      title: "Outcome",
      state: "missing",
      primary: "Trade was cancelled",
      details: [],
      timestamp: entry.exit_date,
    };
  }

  const exitReason = clean(entry.exit_reason);
  const details = [
    entry.exit_price != null ? `Exit ${formatCurrency(entry.exit_price)}` : null,
    entry.pnl_pct != null ? `${entry.pnl_pct >= 0 ? "+" : ""}${entry.pnl_pct.toFixed(2)}%` : null,
    entry.holding_days != null ? `${entry.holding_days}D hold` : null,
    exitReason ? `Exit note: ${exitReason}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return {
    id: "outcome",
    title: "Outcome",
    state: "recorded",
    primary: formatOutcome(entry),
    details,
    timestamp: entry.exit_date,
  };
}

function buildAdherenceStage(entry: JournalEntry): JournalReviewTimelineStage {
  if (entry.status === "open") {
    return {
      id: "adherence",
      title: "Adherence",
      state: "pending",
      primary: "Review after the trade closes",
      details: [],
      timestamp: null,
    };
  }

  if (!isCompletedProcessReview(entry) || !entry.setup_adherence) {
    return {
      id: "adherence",
      title: "Adherence",
      state: "missing",
      primary: "Process review not recorded",
      details: [],
      timestamp: null,
    };
  }

  const ruleBreaks = (entry.rule_breaks ?? []).filter(
    (code): code is JournalRuleBreakCode => typeof code === "string",
  );
  return {
    id: "adherence",
    title: "Adherence",
    state: "recorded",
    primary: ADHERENCE_LABELS[entry.setup_adherence],
    details: ruleBreaks.map(journalRuleBreakLabel),
    timestamp: entry.reviewed_at ?? null,
  };
}

function buildAdjustmentStage(entry: JournalEntry): JournalReviewTimelineStage {
  if (entry.status === "open") {
    return {
      id: "adjustment",
      title: "Next adjustment",
      state: "pending",
      primary: "Add one adjustment during review",
      details: [],
      timestamp: null,
    };
  }

  const lesson = isCompletedProcessReview(entry) ? clean(entry.review_lesson) : null;
  return {
    id: "adjustment",
    title: "Next adjustment",
    state: lesson ? "recorded" : "missing",
    primary: lesson ?? "Next adjustment not recorded",
    details: [],
    timestamp: lesson ? entry.reviewed_at ?? null : null,
  };
}

export function buildJournalReviewTimeline(
  entry: JournalEntry,
  snapshot: JournalChartSnapshot | null,
): JournalReviewTimeline {
  const stages = [
    buildPlanStage(entry),
    buildEntryContextStage(entry, snapshot),
    buildOutcomeStage(entry),
    buildAdherenceStage(entry),
    buildAdjustmentStage(entry),
  ] satisfies JournalReviewTimelineStage[];
  const completedStages = stages.filter((stage) => stage.state === "recorded").length;

  return {
    status: entry.status === "open" ? "in-progress" : completedStages === stages.length ? "complete" : "needs-review",
    completedStages,
    totalStages: 5,
    stages,
  };
}
