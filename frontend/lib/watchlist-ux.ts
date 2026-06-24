import type { WatchlistItem } from "@/lib/api";
import type { WorkflowState } from "@/lib/api";
import { workflowPlanStatus } from "@/lib/workflow";

export type WatchlistSignalTone = "gain" | "amber";

export type WatchlistSignal = {
  label: string;
  tone: WatchlistSignalTone;
  tooltip: string;
  score: number;
};

export const WATCHLIST_QUEUE_STEPS = [
  {
    key: "screen",
    label: "Screen",
    tooltip: "Source ideas from the scanner and build your watchlist queue.",
  },
  {
    key: "chart",
    label: "Chart",
    tooltip: "Review price, volume, and structure on the embedded chart.",
  },
  {
    key: "decision",
    label: "Decision",
    tooltip: "Record entry, stop, target, thesis, and invalidation in Decision Desk.",
  },
  {
    key: "journal",
    label: "Journal",
    tooltip: "Capture the plan as a journal draft — no live execution from here.",
  },
] as const;

export type WatchlistQueueStepKey = (typeof WATCHLIST_QUEUE_STEPS)[number]["key"];

export const WATCHLIST_KEYBOARD_HINT_SESSIONS_KEY = "alphavyuh-watchlist-keyboard-hints";
export const WATCHLIST_KEYBOARD_HINT_BUMPED_KEY = "alphavyuh-watchlist-keyboard-hints-bumped";
export const WATCHLIST_DECISION_EXPANDED_KEY = "alphavyuh-watchlist-decision-expanded";

export function readKeyboardHintSessions(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEYBOARD_HINT_SESSIONS_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function bumpKeyboardHintSession(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(WATCHLIST_KEYBOARD_HINT_BUMPED_KEY)) return;
    const next = readKeyboardHintSessions() + 1;
    window.localStorage.setItem(WATCHLIST_KEYBOARD_HINT_SESSIONS_KEY, String(next));
    window.sessionStorage.setItem(WATCHLIST_KEYBOARD_HINT_BUMPED_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

export function readDecisionDeskExpandedMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WATCHLIST_DECISION_EXPANDED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeDecisionDeskExpandedMap(map: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WATCHLIST_DECISION_EXPANDED_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export function getItemSignals(item: WatchlistItem): WatchlistSignal[] {
  const move = item.pct_change ?? 0;
  const volume = item.volume_ratio ?? 0;
  const rsi = item.rsi_14 ?? 50;
  const signals: WatchlistSignal[] = [];

  if (move >= 2 && volume >= 1.5 && rsi >= 58) {
    signals.push({
      label: "2% up + vol",
      tone: "gain",
      tooltip: "Strong up move with elevated volume and RSI above 58.",
      score: 95,
    });
  }
  if (move >= 0.5 && volume >= 1.2 && rsi >= 55) {
    signals.push({
      label: "RSI 55+ + vol",
      tone: "gain",
      tooltip: "Positive move with volume expansion and RSI momentum.",
      score: 82,
    });
  }
  if (move <= -2 && volume >= 1.3) {
    signals.push({
      label: "2% down + vol",
      tone: "amber",
      tooltip: "Sharp down move on volume — review support before acting.",
      score: 28,
    });
  }
  if (move > -1 && move < 1 && rsi >= 42 && rsi <= 58) {
    signals.push({
      label: "Flat range",
      tone: "amber",
      tooltip: "Price is consolidating with neutral RSI.",
      score: 64,
    });
  }
  if (signals.length === 0) {
    signals.push({
      label: "Watch",
      tone: "amber",
      tooltip: "No strong metric match yet — keep on the queue for review.",
      score: 50,
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}

export function resolveWatchlistQueueStep(options: {
  chartSymbol: string | null;
  decisionExpanded: boolean;
  plan: WorkflowState | null;
}): WatchlistQueueStepKey {
  const { chartSymbol, decisionExpanded, plan } = options;
  if (!chartSymbol) return "screen";
  const status = workflowPlanStatus(plan);
  if (status.valid) return "journal";
  if (decisionExpanded || plan?.entry || plan?.stop || plan?.target || plan?.thesis?.trim()) {
    return "decision";
  }
  return "chart";
}

export function buildDecisionJournalHref(workflow: WorkflowState | null | undefined): string {
  const symbol = workflow?.symbol?.trim().toUpperCase();
  const params = new URLSearchParams({ tab: "queue" });
  if (symbol) params.set("symbol", symbol);
  return `/journal?${params.toString()}`;
}

export function signalToneColor(tone: WatchlistSignalTone): string {
  return tone === "gain" ? "var(--gain)" : "var(--warn)";
}
