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

export function getTradeFlowMeta(entry: Pick<JournalEntry, "entry_reason" | "status" | "lessons">): TradeFlowMeta {
  const reason = (entry.entry_reason || "").toLowerCase();

  const sourceLabel =
    reason.includes("via chart") ? "Chart order" :
    reason.includes("import") ? "Broker import" :
    "Manual log";

  const brokerLabel =
    reason.includes("zerodha") ? "Zerodha" :
    reason.includes("upstox") ? "Upstox" :
    reason.includes("simulated") ? "Simulated" :
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
