import { describe, expect, it } from "vitest";
import { buildDashboardImportReconciliation } from "@/lib/dashboard-import-reconciliation";
import type { JournalEntry } from "@/lib/api/types";

function entry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: overrides.id ?? "j1",
    user_id: "user-1",
    symbol: overrides.symbol ?? "DIXON",
    company_name: null,
    trade_type: overrides.trade_type ?? "long",
    setup_type: overrides.setup_type ?? "Breakout",
    entry_date: "2026-06-10",
    entry_price: 100,
    quantity: 10,
    exit_date: overrides.exit_date ?? "2026-06-12",
    exit_price: overrides.exit_price ?? 112,
    pnl: overrides.pnl ?? 120,
    pnl_pct: overrides.pnl_pct ?? 12,
    holding_days: overrides.holding_days ?? 2,
    stop_loss: overrides.stop_loss ?? 95,
    target_price: overrides.target_price ?? 118,
    risk_reward: overrides.risk_reward ?? 2,
    entry_reason: overrides.entry_reason ?? "Breakout above base",
    exit_reason: overrides.exit_reason ?? "Target reached",
    mistakes: overrides.mistakes ?? "None",
    lessons: overrides.lessons ?? "Follow volume confirmation",
    status: overrides.status ?? "closed",
    source_page: overrides.source_page ?? "scanner",
    source_context: overrides.source_context ?? "Trend Template",
    scanner_context: null,
    thesis: overrides.thesis ?? "Leadership continuation",
    invalidation_rule: overrides.invalidation_rule ?? "Close below pivot",
    created_at: "2026-06-10T09:30:00Z",
    updated_at: "2026-06-12T15:30:00Z",
    ...overrides,
  };
}

const baseInput = {
  journalEntries: [] as JournalEntry[],
  totalTrades: 0,
  closedTrades: 0,
  openTrades: 0,
  brokerConnected: false,
  brokerName: "zerodha",
  brokerStatusLabel: "Mock broker import ready",
  brokerLastSyncedAt: null,
  brokerCanImport: true,
  brokerSyncStatus: "idle",
  brokerTokenExpired: false,
  brokerPlanAllows: true,
  brokerReadOnly: true,
  accountIssueCount: 0,
  reviewCoveragePartial: false,
  now: "2026-06-13T12:00:00Z",
};

describe("buildDashboardImportReconciliation", () => {
  it("marks a recently synced imported and reviewed sample as ready", () => {
    const reconciliation = buildDashboardImportReconciliation({
      ...baseInput,
      journalEntries: [
        entry({
          entry_reason: "Zerodha import - order #1 [alphavyuh-broker-import:zerodha:order:1] [Zerodha - auto]",
          source_page: null,
          source_context: null,
        }),
        entry({
          id: "j2",
          symbol: "CAMS",
          entry_reason: "Zerodha import - order #2 [alphavyuh-broker-import:zerodha:order:2] [Zerodha - auto]",
          source_page: null,
          source_context: null,
        }),
      ],
      totalTrades: 2,
      closedTrades: 2,
      brokerConnected: true,
      brokerLastSyncedAt: "2026-06-13T09:30:00Z",
    });

    expect(reconciliation.tone).toBe("ready");
    expect(reconciliation.sourceMix).toMatchObject({ imported: 2, planned: 0, manual: 0, unknown: 0 });
    expect(reconciliation.items.find((item) => item.id === "coverage")?.value).toBe("2/2");
    expect(reconciliation.items.find((item) => item.id === "sync")?.value).toBe("Today");
  });

  it("gates reconciliation when broker status is unavailable", () => {
    const reconciliation = buildDashboardImportReconciliation({
      ...baseInput,
      accountIssueCount: 1,
      totalTrades: 2,
      journalEntries: [entry({})],
    });

    expect(reconciliation.tone).toBe("warn");
    expect(reconciliation.primaryAction).toMatchObject({
      id: "broker",
      href: "/data",
      tone: "warn",
    });
  });

  it("asks the user to run import when broker import is available but never synced", () => {
    const reconciliation = buildDashboardImportReconciliation(baseInput);
    const sync = reconciliation.items.find((item) => item.id === "sync");

    expect(reconciliation.tone).toBe("action");
    expect(sync).toMatchObject({
      value: "Never",
      href: "/journal",
      tone: "action",
    });
    expect(reconciliation.items.find((item) => item.id === "coverage")?.value).toBe("No trades");
  });

  it("treats an expired broker token as a warning before import coverage", () => {
    const reconciliation = buildDashboardImportReconciliation({
      ...baseInput,
      brokerConnected: true,
      brokerTokenExpired: true,
      brokerLastSyncedAt: "2026-06-12T09:30:00Z",
      journalEntries: [entry({})],
      totalTrades: 1,
      closedTrades: 1,
    });

    expect(reconciliation.tone).toBe("warn");
    expect(reconciliation.primaryAction).toMatchObject({
      id: "broker",
      value: "Reconnect",
      href: "/settings/broker",
    });
  });

  it("flags unknown trade sources and missing lessons as reconciliation debt", () => {
    const reconciliation = buildDashboardImportReconciliation({
      ...baseInput,
      brokerCanImport: false,
      brokerConnected: false,
      journalEntries: [
        entry({
          source_page: null,
          source_context: null,
          scanner_context: null,
          entry_reason: null,
          lessons: null,
        }),
      ],
      totalTrades: 1,
      closedTrades: 1,
    });

    expect(reconciliation.tone).toBe("action");
    expect(reconciliation.sourceMix).toMatchObject({ unknown: 1 });
    expect(reconciliation.items.find((item) => item.id === "source")).toMatchObject({
      value: "1 unknown",
      tone: "action",
    });
    expect(reconciliation.items.find((item) => item.id === "review")).toMatchObject({
      value: "1 due",
      href: "/journal?review=needs-review",
      tone: "action",
    });
  });

  it("keeps partial imported samples in action state until full coverage is confirmed", () => {
    const reconciliation = buildDashboardImportReconciliation({
      ...baseInput,
      brokerConnected: true,
      brokerLastSyncedAt: "2026-06-12T09:30:00Z",
      journalEntries: [
        entry({
          entry_reason: "Upstox import - order #1 [alphavyuh-broker-import:upstox:order:1] [Upstox - auto]",
          source_page: null,
          source_context: null,
        }),
      ],
      totalTrades: 5,
      closedTrades: 5,
      reviewCoveragePartial: true,
    });

    expect(reconciliation.tone).toBe("action");
    expect(reconciliation.items.find((item) => item.id === "coverage")).toMatchObject({
      value: "1/1",
      tone: "action",
    });
  });
});
