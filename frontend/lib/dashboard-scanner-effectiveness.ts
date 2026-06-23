import type { JournalEntry, ScanAlertMatch, WorkflowState } from "@/lib/api/types";
import { formatDashboardPnl } from "@/lib/dashboard-equity";

export type DashboardScannerTone = "ready" | "action" | "warn" | "empty";

export type DashboardScannerEffectivenessInput = {
  workflowStates: WorkflowState[];
  journalEntries: JournalEntry[];
  scanAlerts: number;
  alertMatchSymbols: number;
  latestScanRunDate?: string | null;
  latestScanAlertName?: string | null;
  latestScanMatchCount?: number | null;
  recentMatches?: ScanAlertMatch[];
  alertIssueCount: number;
  reviewCoveragePartial?: boolean;
};

export type DashboardScannerEffectivenessItem = {
  id: "latest" | "conversion" | "sample" | "preset" | "bottleneck";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardScannerTone;
};

export type DashboardScannerPreset = {
  name: string;
  trades: number;
  reviewed: number;
  pnl: number;
  winRate: number;
  tone: DashboardScannerTone;
};

export type DashboardScannerEffectiveness = {
  tone: DashboardScannerTone;
  headline: string;
  summary: string;
  primaryAction: DashboardScannerEffectivenessItem;
  items: DashboardScannerEffectivenessItem[];
  presets: DashboardScannerPreset[];
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardScannerTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}

function isScannerWorkflow(state: WorkflowState) {
  return state.source === "scanner" || state.scanner_context?.source === "scanner";
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

function scannerLifecycleBuckets(states: WorkflowState[]) {
  const scannerStates = states.filter(isScannerWorkflow);
  const actionable = scannerStates.filter((state) => !state.ignored && state.lifecycle !== "ignored");
  const ignored = scannerStates.length - actionable.length;
  const linked = scannerStates.filter((state) => Boolean(state.journal_id)).length;
  const ready = actionable.filter((state) => (
    state.lifecycle === "ready" ||
    state.lifecycle === "triggered" ||
    state.lifecycle === "open"
  )).length;
  const reviewLater = scannerStates.filter((state) => state.review_later || state.lifecycle === "review_later").length;
  return { scannerStates, actionable, ignored, linked, ready, reviewLater };
}

function presetRows(entries: JournalEntry[]): DashboardScannerPreset[] {
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
      const tone: DashboardScannerTone = closed.length === 0
        ? "empty"
        : reviewed < closed.length
          ? "action"
          : pnl >= 0 && rate >= 50
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

function latestScanDetail(input: DashboardScannerEffectivenessInput) {
  const name = input.latestScanAlertName?.trim();
  const count = Math.max(0, input.latestScanMatchCount ?? input.alertMatchSymbols);
  if (name && input.latestScanRunDate) return `${name} · ${plural(count, "match", "matches")} on ${input.latestScanRunDate}`;
  if (name) return `${name} · ${plural(count, "match", "matches")}`;
  if (input.latestScanRunDate) return `${plural(count, "match", "matches")} on ${input.latestScanRunDate}`;
  return `${plural(Math.max(0, input.alertMatchSymbols), "matched symbol")} waiting`;
}

export function buildDashboardScannerEffectiveness(
  input: DashboardScannerEffectivenessInput,
): DashboardScannerEffectiveness {
  const buckets = scannerLifecycleBuckets(input.workflowStates);
  const scannerEntries = input.journalEntries.filter(isScannerEntry);
  const closedScannerEntries = scannerEntries.filter((entry) => entry.status === "closed");
  const reviewedScannerEntries = closedScannerEntries.filter((entry) => Boolean(entry.lessons?.trim()));
  const unreviewedScannerEntries = closedScannerEntries.length - reviewedScannerEntries.length;
  const totalPnl = closedScannerEntries.reduce((sum, entry) => sum + (finite(entry.pnl) ?? 0), 0);
  const rate = winRate(closedScannerEntries);
  const rows = presetRows(scannerEntries);

  const latestItem: DashboardScannerEffectivenessItem = input.alertIssueCount > 0
    ? {
        id: "latest",
        label: "Latest scan",
        value: "Unavailable",
        detail: "Saved scan alerts or recent matches could not be confirmed.",
        href: "/alerts",
        tone: "warn",
      }
    : input.alertMatchSymbols > 0
      ? {
          id: "latest",
          label: "Latest scan",
          value: plural(input.alertMatchSymbols, "symbol"),
          detail: latestScanDetail(input),
          href: "/alerts",
          tone: "action",
        }
      : input.scanAlerts > 0
        ? {
            id: "latest",
            label: "Latest scan",
            value: plural(input.scanAlerts, "armed scan"),
            detail: "Saved scanner alerts are ready for the next completed market session.",
            href: "/alerts",
            tone: "ready",
          }
        : {
            id: "latest",
            label: "Latest scan",
            value: "No alerts",
            detail: "Save scanner alerts so discovery can run without manual reruns.",
            href: "/scanner",
            tone: "empty",
          };

  const conversionItem: DashboardScannerEffectivenessItem = buckets.scannerStates.length === 0
    ? {
        id: "conversion",
        label: "Idea conversion",
        value: "No queue",
        detail: "Shortlist scanner results to build a measurable idea funnel.",
        href: "/scanner",
        tone: "empty",
      }
    : {
        id: "conversion",
        label: "Idea conversion",
        value: `${buckets.linked}/${buckets.scannerStates.length}`,
        detail: `${plural(buckets.ready, "active setup")} ready/open; ${plural(buckets.ignored, "ignored idea")} filtered out.`,
        href: "/watchlist",
        tone: buckets.linked > 0 || buckets.ready > 0 ? "ready" : "action",
      };

  const sampleItem: DashboardScannerEffectivenessItem = closedScannerEntries.length === 0
    ? {
        id: "sample",
        label: "Live sample",
        value: "No closes",
        detail: "Scanner outcomes need closed journal trades before performance can be judged.",
        href: "/journal",
        tone: scannerEntries.length > 0 ? "action" : "empty",
      }
    : {
        id: "sample",
        label: "Live sample",
        value: `${closedScannerEntries.length} closed`,
        detail: `${rate}% win rate · ${formatDashboardPnl(totalPnl)} from scanner-sourced trades.`,
        href: "/journal?tab=analytics",
        tone: unreviewedScannerEntries > 0 || input.reviewCoveragePartial === true
          ? "action"
          : totalPnl >= 0 && rate >= 50
            ? "ready"
            : "action",
      };

  const presetItem: DashboardScannerEffectivenessItem = rows.length > 0
    ? {
        id: "preset",
        label: "Best scanner",
        value: rows[0]?.name ?? "Scanner",
        detail: `${plural(rows[0]?.trades ?? 0, "trade")} · ${(rows[0]?.winRate ?? 0).toFixed(0)}% win rate · ${formatDashboardPnl(rows[0]?.pnl ?? 0)}.`,
        href: "/journal?tab=analytics",
        tone: rows[0]?.tone ?? "empty",
      }
    : {
        id: "preset",
        label: "Best scanner",
        value: "Pending",
        detail: "Scanner preset quality appears after scanner-sourced trades close.",
        href: "/scanner",
        tone: scannerEntries.length > 0 ? "action" : "empty",
      };

  const bottleneckItem: DashboardScannerEffectivenessItem = input.alertIssueCount > 0
    ? {
        id: "bottleneck",
        label: "Bottleneck",
        value: "Alert data",
        detail: "Fix alert data before trusting scanner workflow measurement.",
        href: "/data",
        tone: "warn",
      }
    : unreviewedScannerEntries > 0
      ? {
          id: "bottleneck",
          label: "Bottleneck",
          value: `${unreviewedScannerEntries} reviews`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded scanner trades need lessons; full-history debt may be larger."
            : "Closed scanner trades need lessons before scanner quality is reliable.",
          href: "/journal?review=needs-review",
          tone: "action",
        }
      : buckets.reviewLater > 0
        ? {
            id: "bottleneck",
            label: "Bottleneck",
            value: `${buckets.reviewLater} later`,
            detail: "Scanner ideas parked for later should be promoted or cleared.",
            href: "/watchlist",
            tone: "action",
          }
        : buckets.scannerStates.length > 0 || closedScannerEntries.length > 0
          ? {
              id: "bottleneck",
              label: "Bottleneck",
              value: "Clear",
              detail: "Scanner queue has no obvious review bottleneck in the loaded sample.",
              href: "/watchlist",
              tone: "ready",
            }
          : {
              id: "bottleneck",
              label: "Bottleneck",
              value: "Start",
              detail: "Create scanner alerts and shortlist results before bottlenecks can be measured.",
              href: "/scanner",
              tone: "empty",
            };

  const items = [latestItem, conversionItem, sampleItem, presetItem, bottleneckItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? latestItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardScannerTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Scanner measurement is gated"
    : tone === "action"
      ? "Scanner loop needs validation"
      : tone === "empty"
        ? "Build the scanner feedback loop"
        : "Scanner loop is measurable";
  const summary = tone === "warn"
    ? "Restore scan alert evidence before trusting scanner-to-journal performance."
    : tone === "action"
      ? "Move matches through watchlist, journal, and lessons so scanner quality becomes measurable."
      : tone === "empty"
        ? "Save scanner alerts, shortlist candidates, and journal outcomes to create scanner ROI evidence."
        : "Scanner alerts, idea conversion, reviewed outcomes, and preset quality are connected.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    presets: rows,
  };
}
