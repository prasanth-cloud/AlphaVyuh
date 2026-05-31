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

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
  const hasOriginalContext = Boolean(scanner || thesis || invalidation || entry.source_page || cleanValue(entry.source_context));
  const outcome = hasOriginalContext ? outcomeLabel(entry) : null;
  const focus = hasOriginalContext ? processFocus(entry) : null;

  const summary = [
    scanner?.preset_name ? { label: "Original scan", value: scanner.preset_name } : null,
    firstMatch ? { label: "Matched reason", value: firstMatch } : null,
    scanner?.setup_grade || scanner?.setup_score != null
      ? { label: "Setup score", value: [scanner.setup_grade, scanner.setup_score].filter(value => value != null && value !== "").join(" ") }
      : null,
    thesis ? { label: "Original thesis", value: thesis } : null,
    invalidation ? { label: "Invalidation", value: invalidation } : null,
    entry.risk_reward != null ? { label: "Planned R:R", value: `1:${entry.risk_reward}` } : null,
    outcome ? { label: "Outcome", value: outcome } : null,
    focus ? { label: "Process focus", value: focus } : null,
    scanner?.data_as_of ? { label: "Data at entry", value: scanner.data_as_of } : null,
    { label: "Source", value: sourceLabel },
  ].filter((item): item is { label: string; value: string } => Boolean(item?.value));

  const prompts = [
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
    hasContext: summary.length > 1 || prompts.length > 0,
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
