import type { CSSProperties } from "react";
import type { JournalEntry } from "./types";

export const SETUP_TYPES = [
  "VCP", "Breakout", "Stage 2", "Base Build", "Cup & Handle",
  "Oversold Bounce", "Trend Follow", "Earnings Play", "Pullback", "Reversal", "Other",
];

export const inputStyle: CSSProperties = {
  width: "100%", borderRadius: "var(--radius-md)", padding: "7px 10px", fontSize: 13,
  background: "var(--surface-2)", border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)", outline: "none",
};

export function fmtCcy(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const str = abs >= 100000
    ? `₹${(abs / 100000).toFixed(2)}L`
    : `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return v >= 0 ? str : `-${str}`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
  });
}

export type TradeFlowMeta = {
  sourceLabel: string;
  brokerLabel: string | null;
  autoRecorded: boolean;
  reviewLabel: string;
  reviewTone: "accent" | "gain" | "warn" | "neutral";
};

type ContextEntry = Pick<
  JournalEntry,
  "entry_reason" | "status" | "lessons" | "source_page" | "source_context" | "scanner_context" | "thesis" | "invalidation_rule" | "setup_type" | "risk_reward" | "pnl" | "holding_days"
>;

export type ReviewContext = {
  hasContext: boolean;
  summary: { label: string; value: string }[];
  prompts: string[];
  fallback: string;
};

type DecisionMemoryEntry = Pick<
  JournalEntry,
  "entry_reason" | "status" | "lessons" | "source_page" | "source_context" | "scanner_context" | "thesis" | "invalidation_rule"
>;

export type DecisionMemorySummary = {
  status: "unavailable" | "build-sample" | "needs-review" | "ready";
  headline: string;
  nextAction: string;
  coveragePct: number;
  closedTrades: number;
  reviewedTrades: number;
  decisionContextCount: number;
  sourceCounts: {
    scanner: number;
    watchlist: number;
    chart: number;
    broker: number;
    manual: number;
  };
};

export type JournalReviewStage = {
  status: "unavailable" | "empty" | "build-sample" | "needs-review" | "ready";
  headline: string;
  detail: string;
  primaryAction: string;
  secondaryAction: string;
  progressLabel: string;
  progressPct: number;
  processChange: string;
};

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compactLesson(value: string | null | undefined): string | null {
  const cleaned = cleanValue(value);
  if (!cleaned) return null;
  return cleaned.length > 96 ? `${cleaned.slice(0, 93).trim()}...` : cleaned;
}

function outcomeLabel(entry: Pick<ContextEntry, "pnl" | "holding_days">): string | null {
  const parts: string[] = [];
  if (entry.pnl != null) {
    parts.push(`${entry.pnl >= 0 ? "Gain" : "Loss"} ${fmtCcy(entry.pnl)}`);
  }
  if (entry.holding_days != null) {
    parts.push(`${entry.holding_days}D hold`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function capturedPriceLabel(entry: ContextEntry): string | null {
  const scanner = entry.scanner_context;
  const price = scanner?.captured_price;
  if (price == null || !Number.isFinite(price)) return null;
  const parts = [
    `₹${price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    scanner?.captured_change_pct != null && Number.isFinite(scanner.captured_change_pct)
      ? `${scanner.captured_change_pct >= 0 ? "+" : ""}${scanner.captured_change_pct.toFixed(2)}%`
      : null,
    scanner?.captured_volume_ratio != null && Number.isFinite(scanner.captured_volume_ratio)
      ? `${scanner.captured_volume_ratio.toFixed(2)}x volume`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function processFocus(entry: ContextEntry): string | null {
  const setupScore = entry.scanner_context?.setup_score;
  if (entry.pnl != null && setupScore != null && setupScore >= 80) {
    return entry.pnl >= 0
      ? "High-score setup worked"
      : "High-score setup failed";
  }
  if (entry.pnl != null && entry.risk_reward != null && entry.risk_reward >= 2 && entry.pnl < 0) {
    return "Good planned R:R, poor outcome";
  }
  if (entry.holding_days != null && entry.holding_days <= 1) {
    return "Fast exit review";
  }
  if (entry.holding_days != null && entry.holding_days >= 10) {
    return "Hold discipline review";
  }
  return null;
}

function sourceLabelFromEntry(entry: Pick<JournalEntry, "source_page" | "entry_reason">): string {
  const reason = (entry.entry_reason || "").toLowerCase();
  if (entry.source_page === "watchlist") return "Watchlist plan";
  if (entry.source_page === "chart") return "Chart order";
  if (entry.source_page === "scanner") return "Scanner idea";
  if (reason.includes("simulated") && reason.includes("watchlist")) return "Watchlist plan";
  if (reason.includes("simulated") || reason.includes("via chart")) return "Chart order";
  if (reason.includes("scanner:")) return "Scanner idea";
  if (reason.includes("import")) return "Broker import";
  return "Manual log";
}

export function getReviewContext(entry: ContextEntry): ReviewContext {
  const scanner = entry.scanner_context ?? null;
  const thesis = cleanValue(entry.thesis);
  const invalidation = cleanValue(entry.invalidation_rule);
  const firstMatch = scanner?.match_reasons?.find(reason => cleanValue(reason));
  const sourceLabel = sourceLabelFromEntry(entry);
  const hasOriginalContext = Boolean(scanner || thesis || invalidation);
  const outcome = hasOriginalContext ? outcomeLabel(entry) : null;
  const focus = hasOriginalContext ? processFocus(entry) : null;
  const captured = hasOriginalContext ? capturedPriceLabel(entry) : null;

  const summary = [
    scanner?.preset_name ? { label: "Original scan", value: scanner.preset_name } : null,
    firstMatch ? { label: "Matched reason", value: firstMatch } : null,
    captured ? { label: "Captured price", value: captured } : null,
    scanner?.setup_grade || scanner?.setup_score != null
      ? { label: "Setup score", value: [scanner.setup_grade, scanner.setup_score].filter(value => value != null && value !== "").join(" ") }
      : null,
    thesis ? { label: "Original thesis", value: thesis } : null,
    invalidation ? { label: "Invalidation", value: invalidation } : null,
    entry.risk_reward != null ? { label: "Planned R:R", value: `1:${entry.risk_reward}` } : null,
    outcome ? { label: "Outcome", value: outcome } : null,
    focus ? { label: "Process focus", value: focus } : null,
    scanner?.data_as_of ? { label: "Data at entry", value: scanner.data_as_of } : null,
    scanner?.chart_snapshot?.chart_url
      ? { label: "Chart at entry", value: scanner.chart_snapshot.chart_url }
      : null,
    { label: "Source", value: sourceLabel },
  ].filter((item): item is { label: string; value: string } => Boolean(item?.value));

  const prompts = [
    thesis || invalidation
      ? "Did this trade follow the recorded thesis and invalidation, or did the plan change after entry?"
      : null,
    "What leaked edge in this trade: entry timing, exit discipline, sizing, setup quality, or market regime?",
    focus ? `Process focus: ${focus}. What rule does this trade add, confirm, or retire from your playbook?` : null,
    entry.pnl != null && scanner?.setup_score != null && scanner.setup_score >= 80
      ? `Scanner score ${scanner.setup_score} with ${entry.pnl >= 0 ? "positive" : "negative"} outcome. Which setup condition best explained the result?`
      : null,
    entry.pnl != null && entry.risk_reward != null && entry.risk_reward >= 2 && entry.pnl < 0
      ? `Planned R:R was 1:${entry.risk_reward}, but the outcome was negative. Was the issue entry timing, stop discipline, or setup quality?`
      : null,
    thesis ? `Original thesis: ${thesis}. What changed between entry and exit?` : null,
    invalidation ? `Original invalidation: ${invalidation}. Did the exit happen before, at, or after that point?` : null,
    firstMatch ? `Original scan: ${scanner?.preset_name ?? "Scanner idea"} - ${firstMatch}. Which part of the setup remained visible after entry?` : null,
    entry.risk_reward != null ? `Planned R:R: 1:${entry.risk_reward}. How did the realised outcome compare with the planned risk?` : null,
    entry.setup_type ? `Setup tag: ${entry.setup_type}. Did this trade match how that setup is defined in your journal?` : null,
    scanner?.data_as_of ? `Data at entry: ${scanner.data_as_of}. Was the review based on the same context or later chart movement?` : null,
  ].filter((prompt): prompt is string => Boolean(prompt));

  const fallback = !scanner && !thesis && !invalidation
    ? "Original idea context was not captured for this trade. Review can still use entry, stop, target, exit, P&L, and notes."
    : !scanner
      ? "No scanner context available. Setup, thesis, and invalidation fields improve future review quality."
      : !thesis
        ? "No thesis recorded at entry. This review will focus on recorded prices, risk fields, exit notes, and outcome."
        : "Use the recorded plan and outcome to review process quality.";

  return {
    hasContext: hasOriginalContext,
    summary,
    prompts: prompts.slice(0, 5),
    fallback,
  };
}

export function getTradeFlowMeta(entry: Pick<JournalEntry, "entry_reason" | "status" | "lessons" | "source_page">): TradeFlowMeta {
  const reason = (entry.entry_reason || "").toLowerCase();

  const sourceLabel = sourceLabelFromEntry(entry);

  const brokerLabel =
    reason.includes("zerodha") ? "Zerodha" :
    reason.includes("upstox") ? "Upstox" :
    reason.includes("simulated") ? "Journal capture" :
    null;

  if (entry.status === "open") {
    return {
      sourceLabel,
      brokerLabel,
      autoRecorded: sourceLabel !== "Manual log",
      reviewLabel: "Open",
      reviewTone: "accent",
    };
  }

  if (entry.lessons?.trim()) {
    return {
      sourceLabel,
      brokerLabel,
      autoRecorded: sourceLabel !== "Manual log",
      reviewLabel: "Reviewed",
      reviewTone: "gain",
    };
  }

  return {
    sourceLabel,
    brokerLabel,
    autoRecorded: sourceLabel !== "Manual log",
    reviewLabel: "Needs review",
    reviewTone: "warn",
  };
}

function hasDecisionContext(entry: DecisionMemoryEntry): boolean {
  return Boolean(
    entry.scanner_context ||
    cleanValue(entry.source_context) ||
    cleanValue(entry.thesis) ||
    cleanValue(entry.invalidation_rule) ||
    (entry.source_page && entry.source_page !== "manual"),
  );
}

export function getDecisionMemorySummary(
  entries: DecisionMemoryEntry[],
  options: { closedTrades?: number; reviewedTrades?: number; unavailable?: boolean } = {},
): DecisionMemorySummary {
  const closedEntries = entries.filter((entry) => entry.status === "closed");
  const closedTrades = options.closedTrades ?? closedEntries.length;
  const reviewedTrades = options.reviewedTrades ?? closedEntries.filter((entry) => Boolean(entry.lessons?.trim())).length;
  const decisionContextCount = closedEntries.filter(hasDecisionContext).length;
  const coveragePct = closedTrades > 0 ? Math.min(100, Math.round((reviewedTrades / closedTrades) * 100)) : 0;

  const sourceCounts = entries.reduce<DecisionMemorySummary["sourceCounts"]>((counts, entry) => {
    const sourceLabel = sourceLabelFromEntry(entry);
    if (sourceLabel === "Scanner idea") counts.scanner += 1;
    else if (sourceLabel === "Watchlist plan") counts.watchlist += 1;
    else if (sourceLabel === "Chart order") counts.chart += 1;
    else if (sourceLabel === "Broker import") counts.broker += 1;
    else counts.manual += 1;
    return counts;
  }, { scanner: 0, watchlist: 0, chart: 0, broker: 0, manual: 0 });

  if (options.unavailable) {
    return {
      status: "unavailable",
      headline: "Decision memory unavailable",
      nextAction: "Restore Journal before reviewing playbook quality.",
      coveragePct: 0,
      closedTrades: 0,
      reviewedTrades: 0,
      decisionContextCount: 0,
      sourceCounts,
    };
  }

  if (closedTrades < 3) {
    return {
      status: "build-sample",
      headline: "Build a 3-trade review sample",
      nextAction: `Close ${3 - closedTrades} more ${3 - closedTrades === 1 ? "trade" : "trades"} with entry plan context.`,
      coveragePct,
      closedTrades,
      reviewedTrades,
      decisionContextCount,
      sourceCounts,
    };
  }

  if (reviewedTrades < closedTrades) {
    const remaining = closedTrades - reviewedTrades;
    return {
      status: "needs-review",
      headline: `${remaining} closed ${remaining === 1 ? "trade needs" : "trades need"} review`,
      nextAction: "Turn closed trades into lessons before judging setup quality.",
      coveragePct,
      closedTrades,
      reviewedTrades,
      decisionContextCount,
      sourceCounts,
    };
  }

  return {
    status: "ready",
    headline: "Decision memory is current",
    nextAction: "Keep logging the original plan, source, and outcome for each new trade.",
    coveragePct,
    closedTrades,
    reviewedTrades,
    decisionContextCount,
    sourceCounts,
  };
}

export function getJournalReviewStage(
  entries: DecisionMemoryEntry[],
  options: {
    totalTrades: number;
    closedTrades: number;
    reviewedTrades: number;
    needsReview: number;
    unavailable?: boolean;
  },
): JournalReviewStage {
  const reviewBasePct = Math.min(100, Math.round((Math.min(options.closedTrades, 3) / 3) * 100));
  const coveragePct = options.closedTrades > 0
    ? Math.min(100, Math.round((options.reviewedTrades / options.closedTrades) * 100))
    : 0;
  const latestLesson = compactLesson(
    entries
      .filter((entry) => entry.status === "closed" && entry.lessons?.trim())
      .slice()
      .reverse()
      .find((entry) => entry.lessons?.trim())?.lessons,
  );

  if (options.unavailable) {
    return {
      status: "unavailable",
      headline: "Journal review is paused",
      detail: "Trades are not being treated as empty while Journal recovers.",
      primaryAction: "Retry Journal",
      secondaryAction: "Open Data Status",
      progressLabel: "Review paused",
      progressPct: 0,
      processChange: "Process review waits for account data to recover.",
    };
  }

  if (options.totalTrades === 0) {
    return {
      status: "empty",
      headline: "Start with one logged or imported trade",
      detail: "Import a broker report or log a manual trade so Journal can preserve the entry idea, exit, and lesson.",
      primaryAction: "Log first trade",
      secondaryAction: "Import broker trades",
      progressLabel: "0/3 closed trades",
      progressPct: 0,
      processChange: "No process pattern yet. Capture the first decision before judging performance.",
    };
  }

  if (options.closedTrades < 3) {
    const remaining = 3 - options.closedTrades;
    return {
      status: "build-sample",
      headline: "Build a 3-trade review base",
      detail: `${remaining} more closed ${remaining === 1 ? "trade" : "trades"} before journal-wide review has enough history.`,
      primaryAction: "Log or close next trade",
      secondaryAction: "View Trades",
      progressLabel: `${options.closedTrades}/3 closed trades`,
      progressPct: reviewBasePct,
      processChange: "Early sample: record entry setup, stop, target, exit note, and one lesson per closed trade.",
    };
  }

  if (options.needsReview > 0) {
    return {
      status: "needs-review",
      headline: `${options.needsReview} closed ${options.needsReview === 1 ? "trade needs" : "trades need"} review`,
      detail: "Attach a lesson to every closed trade before trusting broad pattern analysis.",
      primaryAction: "Review next trade",
      secondaryAction: "View reviewed trades",
      progressLabel: `${options.reviewedTrades}/${options.closedTrades} reviewed`,
      progressPct: coveragePct,
      processChange: latestLesson
        ? `Latest process note: ${latestLesson}`
        : "The process story is incomplete until the next closed trade gets a lesson.",
    };
  }

  return {
    status: "ready",
    headline: "Review coverage is current",
    detail: "Closed trades have lessons attached, so the next useful step is pattern review before another plan.",
    primaryAction: "Run journal-wide review",
    secondaryAction: "Open Analytics",
    progressLabel: `${options.reviewedTrades}/${options.closedTrades} reviewed`,
    progressPct: coveragePct,
    processChange: latestLesson
      ? `Latest process note: ${latestLesson}`
      : "Process notes are current; keep attaching the original plan and exit reason to each new trade.",
  };
}
