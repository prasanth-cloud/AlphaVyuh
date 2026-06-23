import { describe, expect, it } from "vitest";
import type { JournalEntry, WorkflowState } from "@/lib/api/types";
import { buildDashboardValidationLab } from "@/lib/dashboard-validation-lab";

function workflow(overrides: Partial<WorkflowState>): WorkflowState {
  return {
    symbol: overrides.symbol ?? "DIXON",
    lifecycle: overrides.lifecycle ?? "watch",
    source: "scanner",
    scanner_context: {
      source: "scanner",
      preset_name: "Trend Template",
      match_reasons: ["Volume expansion"],
      setup_score: 82,
    },
    ignored: false,
    review_later: false,
    ...overrides,
  };
}

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
    entry_reason: overrides.entry_reason ?? "Scanner: Trend Template",
    exit_reason: overrides.exit_reason ?? "Target reached",
    mistakes: overrides.mistakes ?? "None",
    lessons: overrides.lessons ?? "Follow volume confirmation",
    status: overrides.status ?? "closed",
    source_page: overrides.source_page ?? "scanner",
    source_context: overrides.source_context ?? "Trend Template",
    scanner_context: {
      source: "scanner",
      preset_name: "Trend Template",
      match_reasons: ["Volume expansion"],
    },
    thesis: overrides.thesis ?? "Leadership continuation",
    invalidation_rule: overrides.invalidation_rule ?? "Close below pivot",
    created_at: "2026-06-10T09:30:00Z",
    updated_at: "2026-06-12T15:30:00Z",
    ...overrides,
  };
}

const baseInput = {
  marketDataStatus: "healthy" as const,
  workflowStates: [] as WorkflowState[],
  journalEntries: [] as JournalEntry[],
  scanAlerts: 0,
  alertMatchSymbols: 0,
  latestScanRunDate: null,
  latestScanAlertName: null,
  latestScanMatchCount: null,
  alertIssueCount: 0,
  reviewCoveragePartial: false,
};

describe("buildDashboardValidationLab", () => {
  it("starts from scanner setup when no validation loop exists", () => {
    const lab = buildDashboardValidationLab(baseInput);

    expect(lab.tone).toBe("empty");
    expect(lab.primaryAction).toMatchObject({
      id: "backtest",
      href: "/scanner",
      tone: "empty",
    });
  });

  it("gates validation when data or alert evidence is unavailable", () => {
    const lab = buildDashboardValidationLab({
      ...baseInput,
      marketDataStatus: "stale",
      alertIssueCount: 1,
      scanAlerts: 2,
    });

    expect(lab.tone).toBe("warn");
    expect(lab.primaryAction).toMatchObject({
      id: "backtest",
      value: "Data gate",
      href: "/data",
      tone: "warn",
    });
  });

  it("surfaces fresh scanner matches as a forward-test action", () => {
    const lab = buildDashboardValidationLab({
      ...baseInput,
      scanAlerts: 2,
      alertMatchSymbols: 5,
      latestScanAlertName: "Trend Template",
      latestScanRunDate: "2026-06-12",
    });

    expect(lab.tone).toBe("action");
    expect(lab.items.find((item) => item.id === "forward")).toMatchObject({
      value: "5 matches",
      href: "/alerts",
      tone: "action",
    });
  });

  it("marks a reviewed positive scanner sample as usable evidence", () => {
    const lab = buildDashboardValidationLab({
      ...baseInput,
      scanAlerts: 2,
      workflowStates: [
        workflow({ symbol: "DIXON", lifecycle: "closed", journal_id: "j1" }),
        workflow({ symbol: "CAMS", lifecycle: "closed", journal_id: "j2" }),
      ],
      journalEntries: [
        entry({ id: "j1", symbol: "DIXON", pnl: 100 }),
        entry({ id: "j2", symbol: "CAMS", pnl: 80 }),
        entry({ id: "j3", symbol: "AUBANK", pnl: 60 }),
        entry({ id: "j4", symbol: "LT", pnl: 40 }),
        entry({ id: "j5", symbol: "ITC", pnl: 20 }),
      ],
    });

    expect(lab.tone).toBe("ready");
    expect(lab.items.find((item) => item.id === "gate")).toMatchObject({
      value: "Evidence",
      href: "/journal?tab=analytics",
      tone: "ready",
    });
    expect(lab.presets[0]).toMatchObject({
      name: "Trend Template",
      trades: 5,
      reviewed: 5,
      tone: "ready",
    });
  });

  it("keeps thin or unreviewed samples in action state", () => {
    const lab = buildDashboardValidationLab({
      ...baseInput,
      scanAlerts: 1,
      workflowStates: [
        workflow({ symbol: "DIXON", lifecycle: "ready" }),
      ],
      journalEntries: [
        entry({ lessons: null, mistakes: null }),
        entry({ id: "j2", symbol: "CAMS", pnl: -50 }),
      ],
    });

    expect(lab.tone).toBe("action");
    expect(lab.items.find((item) => item.id === "sample")).toMatchObject({
      value: "2/5",
      tone: "action",
    });
    expect(lab.items.find((item) => item.id === "gate")).toMatchObject({
      value: "1 reviews",
      href: "/journal?review=needs-review",
      tone: "action",
    });
  });

  it("separates preset evidence by scanner source context", () => {
    const lab = buildDashboardValidationLab({
      ...baseInput,
      scanAlerts: 1,
      journalEntries: [
        entry({ source_context: "Trend Template", pnl: 200 }),
        entry({
          id: "j2",
          source_context: "Momentum Burst",
          scanner_context: { source: "scanner", preset_name: "Momentum Burst", match_reasons: ["Volume thrust"] },
          pnl: -50,
        }),
        entry({ id: "j3", source_context: "Trend Template", pnl: 100 }),
      ],
    });

    expect(lab.presets.map((preset) => preset.name)).toEqual(["Trend Template", "Momentum Burst"]);
    expect(lab.items.find((item) => item.id === "edge")?.value).toBe("Trend Template");
  });
});
