import type { JournalEntry } from "@/lib/api/types";

export type DashboardImportReconciliationTone = "ready" | "action" | "warn" | "empty";

export type DashboardImportReconciliationInput = {
  journalEntries: JournalEntry[];
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  brokerConnected: boolean;
  brokerName: string | null;
  brokerStatusLabel: string | null;
  brokerLastSyncedAt: string | null;
  brokerCanImport?: boolean | null;
  brokerSyncStatus?: string | null;
  brokerTokenExpired?: boolean;
  brokerPlanAllows?: boolean | null;
  brokerReadOnly?: boolean | null;
  accountIssueCount: number;
  reviewCoveragePartial?: boolean;
  now?: string | Date;
};

export type DashboardImportSourceMix = {
  imported: number;
  planned: number;
  manual: number;
  unknown: number;
};

export type DashboardImportReconciliationItem = {
  id: "broker" | "sync" | "coverage" | "source" | "review";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardImportReconciliationTone;
};

export type DashboardImportReconciliation = {
  tone: DashboardImportReconciliationTone;
  headline: string;
  summary: string;
  primaryAction: DashboardImportReconciliationItem;
  items: DashboardImportReconciliationItem[];
  sourceMix: DashboardImportSourceMix;
};

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function toneRank(tone: DashboardImportReconciliationTone) {
  if (tone === "warn") return 4;
  if (tone === "action") return 3;
  if (tone === "empty") return 2;
  return 1;
}

function entryText(entry: JournalEntry) {
  return [
    entry.entry_reason,
    entry.exit_reason,
    entry.source_context,
    entry.setup_type,
  ].filter(Boolean).join(" ").toLowerCase();
}

function sourceForEntry(entry: JournalEntry): keyof DashboardImportSourceMix {
  const text = entryText(entry);
  if (
    text.includes("alphavyuh-broker-import") ||
    text.includes("broker import") ||
    text.includes("zerodha import") ||
    text.includes("upstox import") ||
    text.includes("- auto")
  ) {
    return "imported";
  }
  if (entry.source_page === "chart" || entry.source_page === "scanner" || entry.source_page === "watchlist" || entry.scanner_context) {
    return "planned";
  }
  if (entry.source_page === "manual") return "manual";
  return "unknown";
}

function sourceMix(entries: JournalEntry[]): DashboardImportSourceMix {
  return entries.reduce<DashboardImportSourceMix>((mix, entry) => {
    mix[sourceForEntry(entry)] += 1;
    return mix;
  }, { imported: 0, planned: 0, manual: 0, unknown: 0 });
}

function syncAgeLabel(value: string | null, now: Date) {
  if (!value) return null;
  const syncedAt = new Date(value);
  if (!Number.isFinite(syncedAt.getTime())) return "Unknown";
  const days = Math.floor((now.getTime() - syncedAt.getTime()) / 86_400_000);
  if (days < 0) return "Scheduled";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function brokerLabel(input: DashboardImportReconciliationInput) {
  return input.brokerName?.trim() || "Broker";
}

export function buildDashboardImportReconciliation(
  input: DashboardImportReconciliationInput,
): DashboardImportReconciliation {
  const entries = input.journalEntries;
  const mix = sourceMix(entries);
  const loadedTrades = entries.length;
  const totalTrades = Math.max(0, input.totalTrades, loadedTrades);
  const closedEntries = entries.filter((entry) => entry.status === "closed");
  const closedWithoutLessons = closedEntries.filter((entry) => !entry.lessons?.trim()).length;
  const syncStatus = input.brokerSyncStatus?.toLowerCase() ?? null;
  const canImport = input.brokerCanImport === true;
  const brokerBlocked = input.accountIssueCount > 0;
  const tokenExpired = input.brokerTokenExpired === true || syncStatus === "token_expired";
  const planBlocked = input.brokerPlanAllows === false;
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const syncAge = syncAgeLabel(input.brokerLastSyncedAt, now);
  const displayBroker = brokerLabel(input);

  const brokerItem: DashboardImportReconciliationItem = brokerBlocked
    ? {
        id: "broker",
        label: "Broker link",
        value: "Unavailable",
        detail: "Broker status could not be confirmed, so trade history should be treated cautiously.",
        href: "/data",
        tone: "warn",
      }
    : tokenExpired
      ? {
          id: "broker",
          label: "Broker link",
          value: "Reconnect",
          detail: `${displayBroker} access expired before read-only import could be trusted.`,
          href: "/settings/broker",
          tone: "warn",
        }
      : planBlocked
        ? {
            id: "broker",
            label: "Broker link",
            value: "Plan gate",
            detail: "Broker import is not available on the current plan.",
            href: "/settings/broker",
            tone: "action",
          }
        : input.brokerConnected
          ? {
              id: "broker",
              label: "Broker link",
              value: input.brokerReadOnly === false ? "Connected" : "Read-only",
              detail: input.brokerStatusLabel ?? `${displayBroker} import is connected for reconciliation.`,
              href: "/settings/broker",
              tone: "ready",
            }
          : canImport
            ? {
                id: "broker",
                label: "Broker link",
                value: "Import ready",
                detail: input.brokerStatusLabel ?? `${displayBroker} import can be run without placing trades.`,
                href: "/journal",
                tone: "action",
              }
            : {
                id: "broker",
                label: "Broker link",
                value: "Manual",
                detail: input.brokerStatusLabel ?? "Connect read-only broker import when you want automatic reconciliation.",
                href: "/settings/broker",
                tone: totalTrades > 0 ? "action" : "empty",
              };

  const syncItem: DashboardImportReconciliationItem = brokerBlocked
    ? {
        id: "sync",
        label: "Last sync",
        value: "Unknown",
        detail: "Refresh broker status before relying on imported trade history.",
        href: "/data",
        tone: "warn",
      }
    : syncStatus === "failed"
      ? {
          id: "sync",
          label: "Last sync",
          value: "Failed",
          detail: "The latest broker import failed; retry before trusting journal coverage.",
          href: "/journal",
          tone: "warn",
        }
      : syncStatus === "running"
        ? {
            id: "sync",
            label: "Last sync",
            value: "Running",
            detail: "Broker import is currently running; wait for completion before reviewing stats.",
            href: "/journal",
            tone: "action",
          }
        : syncAge
          ? {
              id: "sync",
              label: "Last sync",
              value: syncAge,
              detail: input.brokerLastSyncedAt ?? "Broker sync timestamp recorded.",
              href: "/journal",
              tone: syncAge === "Unknown" ? "action" : "ready",
            }
          : canImport || input.brokerConnected
            ? {
                id: "sync",
                label: "Last sync",
                value: "Never",
                detail: "Run a read-only import so broker fills reconcile with the journal sample.",
                href: "/journal",
                tone: "action",
              }
            : {
                id: "sync",
                label: "Last sync",
                value: "Not set",
                detail: "Manual journal history is available, but broker sync is not configured.",
                href: "/settings/broker",
                tone: totalTrades > 0 ? "action" : "empty",
              };

  const coverageItem: DashboardImportReconciliationItem = totalTrades === 0
    ? {
        id: "coverage",
        label: "Import coverage",
        value: "No trades",
        detail: "Import or add trades before analytics, risk, and AI review can become useful.",
        href: canImport ? "/journal" : "/settings/broker",
        tone: "empty",
      }
    : mix.imported > 0
      ? {
          id: "coverage",
          label: "Import coverage",
          value: `${mix.imported}/${loadedTrades}`,
          detail: `${plural(mix.imported, "loaded trade")} came from broker import${input.reviewCoveragePartial ? "; full-history coverage may be larger." : "."}`,
          href: "/journal",
          tone: mix.unknown > 0 || input.reviewCoveragePartial === true ? "action" : "ready",
        }
      : canImport
        ? {
            id: "coverage",
            label: "Import coverage",
            value: "0 imported",
            detail: "Broker import is available, but the loaded trade sample is still manual or unknown.",
            href: "/journal",
            tone: "action",
          }
        : {
            id: "coverage",
            label: "Import coverage",
            value: "Manual",
            detail: `${plural(totalTrades, "trade")} exist without broker-import evidence.`,
            href: "/settings/broker",
            tone: "action",
          };

  const sourceItem: DashboardImportReconciliationItem = totalTrades === 0
    ? {
        id: "source",
        label: "Source hygiene",
        value: "Empty",
        detail: "Trade provenance will appear after journal history is added.",
        href: "/journal",
        tone: "empty",
      }
    : mix.unknown > 0
      ? {
          id: "source",
          label: "Source hygiene",
          value: `${mix.unknown} unknown`,
          detail: "Some loaded trades are missing scanner, chart, manual, or broker source context.",
          href: "/journal",
          tone: "action",
        }
      : {
          id: "source",
          label: "Source hygiene",
          value: "Tagged",
          detail: `${plural(mix.planned, "planned trade")}, ${plural(mix.manual, "manual trade")}, ${plural(mix.imported, "imported trade")}.`,
          href: "/journal",
          tone: "ready",
        };

  const reviewItem: DashboardImportReconciliationItem = closedEntries.length === 0
    ? {
        id: "review",
        label: "Review reconciliation",
        value: input.closedTrades > 0 ? `${input.closedTrades} closed` : "No closes",
        detail: input.closedTrades > 0
          ? "Closed-trade stats exist, but the loaded sample did not include lesson coverage."
          : "Closed trades with lessons unlock more reliable analytics and AI review.",
        href: "/journal",
        tone: input.closedTrades > 0 ? "action" : "empty",
      }
    : closedWithoutLessons > 0
      ? {
          id: "review",
          label: "Review reconciliation",
          value: `${closedWithoutLessons} due`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded closed trades need lessons; older history may still have review debt."
            : "Closed trades need lessons before AI and setup stats are decision-grade.",
          href: "/journal?review=needs-review",
          tone: "action",
        }
      : {
          id: "review",
          label: "Review reconciliation",
          value: "Clear",
          detail: input.reviewCoveragePartial === true
            ? "Loaded closed trades have lessons; full-history coverage is still partial."
            : `${plural(closedEntries.length, "closed trade")} have lesson context.`,
          href: "/journal?tab=analytics",
          tone: input.reviewCoveragePartial === true ? "action" : "ready",
        };

  const items = [brokerItem, syncItem, coverageItem, sourceItem, reviewItem];
  const primaryAction = [...items].sort((a, b) => toneRank(b.tone) - toneRank(a.tone))[0] ?? brokerItem;
  const hasWarn = items.some((item) => item.tone === "warn");
  const hasAction = items.some((item) => item.tone === "action");
  const hasEmpty = items.some((item) => item.tone === "empty");
  const tone: DashboardImportReconciliationTone = hasWarn ? "warn" : hasAction ? "action" : hasEmpty ? "empty" : "ready";
  const headline = tone === "warn"
    ? "Trade history needs a trust check"
    : tone === "action"
      ? "Reconcile trade history before analysis"
      : tone === "empty"
        ? "Start trade history"
        : "Trade history is reconciled";
  const summary = tone === "warn"
    ? "Fix broker status or sync failures before relying on journal totals, risk stats, or AI review."
    : tone === "action"
      ? "Run import, tag trade sources, and clear review debt so downstream analytics are credible."
      : tone === "empty"
        ? "Import broker fills or add manual trades to turn the dashboard from setup tracking into performance review."
        : "Broker sync, source labels, import coverage, and lesson checks are aligned for the loaded sample.";

  return {
    tone,
    headline,
    summary,
    primaryAction,
    items,
    sourceMix: mix,
  };
}
