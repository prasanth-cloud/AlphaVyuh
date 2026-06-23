import type { DataHealth, JournalEntry, WorkflowState } from "@/lib/api/types";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

export type DashboardValidationTone = "ready" | "action" | "warn" | "empty";

export type DashboardValidationLabInput = {
  marketDataStatus: DataHealth["status"] | null;
  workflowStates: WorkflowState[];
  journalEntries: JournalEntry[];
  scanAlerts: number;
  alertMatchSymbols: number;
  latestScanRunDate?: string | null;
  latestScanAlertName?: string | null;
  latestScanMatchCount?: number | null;
  alertIssueCount: number;
  reviewCoveragePartial?: boolean;
};

export type DashboardValidationItem = {
  id: "backtest" | "forward" | "sample" | "edge" | "gate";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardValidationTone;
};

export type DashboardValidationPreset = {
  name: string;
  trades: number;
  reviewed: number;
  pnl: number;
  winRate: number;
  tone: DashboardValidationTone;
};

export type DashboardValidationLab = {
  tone: DashboardValidationTone;
  headline: string;
  summary: string;
  primaryAction: DashboardValidationItem;
  items: DashboardValidationItem[];
  presets: DashboardValidationPreset[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardValidationTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function entryText(entry: JournalEntry) {
  return [
    entry.entry_reason,
    entry.source_context,
    entry.setup_type,
  ].filter(Boolean).join(" ").toLowerCase();
}

function isScannerEntry(entry: JournalEntry) {
  return entry.source_page === "scanner" ||
    entry.scanner_context?.source === "scanner" ||
    entryText(entry).includes("scanner:");
}

function isScannerWorkflow(state: WorkflowState) {
  return state.source === "scanner" || state.scanner_context?.source === "scanner";
}

function scannerPresetName(entry: JournalEntry) {
  return entry.scanner_context?.preset_name?.trim() ||
    entry.source_context?.trim() ||
    entry.setup_type?.trim() ||
    "Scanner";
}

function winRate(entries: JournalEntry[]) {
  if (entries.length === 0) return 0;
  const wins = entries.filter((entry) => (finite(entry.pnl) ?? 0) > 0).length;
  return Math.round((wins / entries.length) * 100);
}

function presetRows(entries: JournalEntry[]): DashboardValidationPreset[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const key = scannerPresetName(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return Array.from(groups.entries())
    .map(([name, rows]) => {
      const closed = rows.filter((entry) => entry.status === "closed");
      const reviewed = closed.filter((entry) => Boolean(entry.lessons?.trim())).length;
      const pnl = closed.reduce((sum, entry) => sum + (finite(entry.pnl) ?? 0), 0);
      const rate = winRate(closed);
      const tone: DashboardValidationTone = closed.length === 0
        ? "empty"
        : reviewed < closed.length
          ? "action"
          : closed.length >= 5 && pnl >= 0 && rate >= 50
            ? "ready"
            : "action";
      return {
        name,
        trades: closed.length,
        reviewed,
        pnl,
        winRate: rate,
        tone,
      };
    })
    .filter((row) => row.trades > 0)
    .sort((a, b) => b.pnl - a.pnl || b.trades - a.trades)
    .slice(0, 3);
}

function latestScanLabel(input: DashboardValidationLabInput) {
  const name = input.latestScanAlertName?.trim();
  const count = Math.max(0, input.latestScanMatchCount ?? input.alertMatchSymbols);
  if (name && input.latestScanRunDate) return `${name} · ${plural(count, "match", "matches")} on ${input.latestScanRunDate}`;
  if (name) return `${name} · ${plural(count, "match", "matches")}`;
  if (input.latestScanRunDate) return `${plural(count, "match", "matches")} on ${input.latestScanRunDate}`;
  return `${plural(Math.max(0, input.alertMatchSymbols), "matched symbol")} waiting`;
}

export function buildDashboardValidationLab(
  input: DashboardValidationLabInput,
): DashboardValidationLab {
  const scannerEntries = input.journalEntries.filter(isScannerEntry);
  const closedScannerEntries = scannerEntries.filter((entry) => entry.status === "closed");
  const reviewedClosedEntries = closedScannerEntries.filter((entry) => Boolean(entry.lessons?.trim()));
  const unreviewedClosedEntries = closedScannerEntries.length - reviewedClosedEntries.length;
  const totalPnl = closedScannerEntries.reduce((sum, entry) => sum + (finite(entry.pnl) ?? 0), 0);
  const rate = winRate(closedScannerEntries);
  const presets = presetRows(scannerEntries);
  const scannerStates = input.workflowStates.filter(isScannerWorkflow);
  const linkedIdeas = scannerStates.filter((state) => Boolean(state.journal_id)).length;
  const activeIdeas = scannerStates.filter((state) => (
    state.lifecycle === "ready" ||
    state.lifecycle === "triggered" ||
    state.lifecycle === "open"
  ) && !state.ignored).length;
  const enoughSample = closedScannerEntries.length >= 5;
  const allReviewed = closedScannerEntries.length > 0 && unreviewedClosedEntries === 0 && input.reviewCoveragePartial !== true;
  const edgePositive = enoughSample && allReviewed && totalPnl >= 0 && rate >= 50;
  const dataGate = input.alertIssueCount > 0 ||
    input.marketDataStatus === "degraded" ||
    input.marketDataStatus === "stale" ||
    input.marketDataStatus === "unknown" ||
    !input.marketDataStatus;

  const backtestItem: DashboardValidationItem = dataGate
    ? {
        id: "backtest",
        label: "Backtest bridge",
        value: "Data gate",
        detail: "Confirm market freshness and scan-alert data before comparing setup evidence.",
        href: "/data",
        tone: "warn",
      }
    : presets.length > 0
      ? {
          id: "backtest",
          label: "Backtest bridge",
          value: presets[0]?.name ?? "Preset",
          detail: "Use the top live preset as the starting point until full backtest UI is available.",
          href: "/scanner",
          tone: enoughSample ? "ready" : "action",
        }
      : input.scanAlerts > 0 || scannerStates.length > 0
        ? {
            id: "backtest",
            label: "Backtest bridge",
            value: "Forward test",
            detail: "Scanner rules are armed; close and review outcomes before trusting them.",
            href: "/scanner",
            tone: "action",
          }
        : {
            id: "backtest",
            label: "Backtest bridge",
            value: "No preset",
            detail: "Save a scanner preset or alert before setup validation can begin.",
            href: "/scanner",
            tone: "empty",
          };

  const forwardItem: DashboardValidationItem = input.alertIssueCount > 0
    ? {
        id: "forward",
        label: "Forward test",
        value: "Unavailable",
        detail: "Recent scanner matches could not be confirmed.",
        href: "/alerts",
        tone: "warn",
      }
    : input.alertMatchSymbols > 0
      ? {
          id: "forward",
          label: "Forward test",
          value: plural(input.alertMatchSymbols, "match", "matches"),
          detail: latestScanLabel(input),
          href: "/alerts",
          tone: "action",
        }
      : input.scanAlerts > 0
        ? {
            id: "forward",
            label: "Forward test",
            value: plural(input.scanAlerts, "armed scan"),
            detail: "Saved scanner alerts are waiting for the next EOD session.",
            href: "/alerts",
            tone: "ready",
          }
        : {
            id: "forward",
            label: "Forward test",
            value: "Not armed",
            detail: "Create scan alerts so the same setup can be tested every session.",
            href: "/scanner",
            tone: "empty",
          };

  const sampleItem: DashboardValidationItem = closedScannerEntries.length === 0
    ? {
        id: "sample",
        label: "Outcome sample",
        value: "No closes",
        detail: scannerEntries.length > 0
          ? "Scanner ideas exist, but none are closed enough to judge."
          : "Journal scanner outcomes to build a sample.",
        href: "/journal",
        tone: scannerEntries.length > 0 ? "action" : "empty",
      }
    : {
        id: "sample",
        label: "Outcome sample",
        value: `${closedScannerEntries.length}/5`,
        detail: `${rate}% win rate · ${formatDashboardPnl(totalPnl)} from scanner-sourced closes.`,
        href: "/journal?tab=analytics",
        tone: enoughSample && allReviewed ? "ready" : "action",
      };

  const edgeItem: DashboardValidationItem = presets.length > 0
    ? {
        id: "edge",
        label: "Preset edge",
        value: presets[0]?.name ?? "Preset",
        detail: `${plural(presets[0]?.trades ?? 0, "trade")} · ${(presets[0]?.winRate ?? 0).toFixed(0)}% win rate · ${formatDashboardPnl(presets[0]?.pnl ?? 0)}.`,
        href: "/journal?tab=analytics",
        tone: presets[0]?.tone ?? "action",
      }
    : {
        id: "edge",
        label: "Preset edge",
        value: "Pending",
        detail: "The best setup appears after scanner-sourced trades close.",
        href: "/scanner",
        tone: scannerEntries.length > 0 ? "action" : "empty",
      };

  const gateItem: DashboardValidationItem = dataGate
    ? {
        id: "gate",
        label: "Decision gate",
        value: "Blocked",
        detail: "Data freshness or alert evidence is not trustworthy enough for setup validation.",
        href: "/data",
        tone: "warn",
      }
    : edgePositive
      ? {
          id: "gate",
          label: "Decision gate",
          value: "Evidence",
          detail: "Scanner sample is reviewed, positive, and large enough for a first confidence read.",
          href: "/journal?tab=analytics",
          tone: "ready",
        }
      : unreviewedClosedEntries > 0
        ? {
            id: "gate",
            label: "Decision gate",
            value: `${unreviewedClosedEntries} reviews`,
            detail: "Review scanner closes before treating the setup as validated.",
            href: "/journal?review=needs-review",
            tone: "action",
          }
        : activeIdeas > 0 || linkedIdeas > 0
          ? {
              id: "gate",
              label: "Decision gate",
              value: "Watch",
              detail: `${plural(activeIdeas, "active idea")} and ${plural(linkedIdeas, "journal link")} are still building evidence.`,
              href: "/watchlist",
              tone: "action",
            }
          : {
              id: "gate",
              label: "Decision gate",
              value: "Start",
              detail: "No scanner validation loop exists yet.",
              href: "/scanner",
              tone: "empty",
            };

  const items = [backtestItem, forwardItem, sampleItem, edgeItem, gateItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? backtestItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardValidationTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Validation is gated"
    : tone === "action"
      ? "Setup evidence is still forming"
      : tone === "empty"
        ? "Create a validation loop"
        : "Setup evidence is usable";
  const summary = tone === "warn"
    ? "Fix freshness or alert evidence before treating scanner output as validated."
    : tone === "action"
      ? "Keep scanner rules consistent, close outcomes, and review lessons before scaling the setup."
      : tone === "empty"
        ? "Save scanner alerts and journal outcomes to compare setup quality over time."
        : "Forward-test evidence, reviewed outcomes, and preset edge are connected.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    presets,
  };
}
