import { describe, expect, it } from "vitest";
import type { JournalEntry, WorkflowState } from "@/lib/api/types";
import { buildDashboardScannerEffectiveness } from "@/lib/dashboard-scanner-effectiveness";

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

describe("buildDashboardScannerEffectiveness", () => {
  it("shows a start state when no scanner loop exists", () => {
    const scanner = buildDashboardScannerEffectiveness(baseInput);

    expect(scanner.tone).toBe("empty");
    expect(scanner.primaryAction).toMatchObject({
      id: "latest",
      href: "/scanner",
      tone: "empty",
    });
  });

  it("gates scanner measurement when alert data is unavailable", () => {
    const scanner = buildDashboardScannerEffectiveness({
      ...baseInput,
      alertIssueCount: 1,
      alertMatchSymbols: 4,
      workflowStates: [workflow({})],
    });

    expect(scanner.tone).toBe("warn");
    expect(scanner.primaryAction).toMatchObject({
      id: "latest",
      value: "Unavailable",
      href: "/alerts",
    });
  });

  it("surfaces active scan matches as the primary scanner action", () => {
    const scanner = buildDashboardScannerEffectiveness({
      ...baseInput,
      scanAlerts: 2,
      alertMatchSymbols: 5,
      latestScanAlertName: "Trend Template",
      latestScanRunDate: "2026-06-12",
    });

    expect(scanner.tone).toBe("action");
    expect(scanner.primaryAction).toMatchObject({
      id: "latest",
      value: "5 symbols",
      href: "/alerts",
    });
  });

  it("marks a reviewed scanner sample as measurable", () => {
    const scanner = buildDashboardScannerEffectiveness({
      ...baseInput,
      scanAlerts: 2,
      workflowStates: [
        workflow({ symbol: "DIXON", lifecycle: "closed", journal_id: "j1" }),
        workflow({ symbol: "CAMS", lifecycle: "ready" }),
        workflow({ symbol: "SBIN", lifecycle: "ignored", ignored: true }),
      ],
      journalEntries: [
        entry({}),
        entry({ id: "j2", symbol: "CAMS", pnl: 80, source_context: "Trend Template" }),
      ],
    });

    expect(scanner.tone).toBe("ready");
    expect(scanner.items.find((item) => item.id === "conversion")).toMatchObject({
      value: "1/3",
      tone: "ready",
    });
    expect(scanner.items.find((item) => item.id === "sample")).toMatchObject({
      value: "2 closed",
      tone: "ready",
    });
    expect(scanner.presets[0]).toMatchObject({
      name: "Trend Template",
      trades: 2,
      reviewed: 2,
      tone: "ready",
    });
  });

  it("routes closed scanner trades without lessons to review", () => {
    const scanner = buildDashboardScannerEffectiveness({
      ...baseInput,
      scanAlerts: 1,
      journalEntries: [
        entry({ lessons: null, mistakes: null }),
      ],
    });

    expect(scanner.tone).toBe("action");
    expect(scanner.primaryAction).toMatchObject({
      id: "sample",
      tone: "action",
    });
    expect(scanner.items.find((item) => item.id === "bottleneck")).toMatchObject({
      value: "1 reviews",
      href: "/journal?review=needs-review",
      tone: "action",
    });
  });

  it("separates scanner preset quality by source context", () => {
    const scanner = buildDashboardScannerEffectiveness({
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

    expect(scanner.presets.map((preset) => preset.name)).toEqual(["Trend Template", "Momentum Burst"]);
    expect(scanner.items.find((item) => item.id === "preset")?.value).toBe("Trend Template");
  });
});
