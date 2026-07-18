import { describe, expect, it } from "vitest";
import type { JournalEntry, Watchlist, WorkflowState } from "@/lib/api";
import {
  buildDashboardActionBrief,
  buildDashboardPrioritySymbols,
  type DashboardPrioritySymbol,
} from "@/lib/dashboard-action-brief";
import { readFileSync } from "node:fs";

const actionBriefSource = readFileSync("components/dashboard/DashboardActionBrief.tsx", "utf8");

const base = {
  tradeDate: "2026-06-12",
  marketPhase: "Bullish",
  marketDataStatus: "healthy" as const,
  marketDataMode: "eod",
  trackedSymbols: 12,
  watchlistReviewDue: 0,
  scanAlerts: 1,
  alertMatchSymbols: 0,
  closedTrades: 4,
  reviewedTrades: 4,
  openTrades: 0,
  brokerConnected: true,
  brokerName: "Zerodha",
  brokerStatusLabel: "Connected",
  brokerLastSyncedAt: "2026-06-12",
  accountIssueCount: 0,
  alertIssueCount: 0,
};

function prioritySymbol(symbol: string, score: number): DashboardPrioritySymbol {
  return {
    symbol,
    companyName: null,
    watchlistId: "watchlist-1",
    watchlistName: "Swing list",
    label: "Review next",
    score,
    reason: "Pinned",
    detail: "Pinned",
    href: `/watchlist?id=watchlist-1&symbol=${symbol}`,
    chartHref: `/charts/${symbol}?from=dashboard&full=1`,
  };
}

function closedTrade(symbol: string, lessons: string | null): JournalEntry {
  return {
    id: `journal-${symbol}`,
    user_id: "user-1",
    symbol,
    company_name: null,
    trade_type: "long",
    setup_type: "breakout",
    entry_date: "2026-06-01",
    entry_price: 100,
    quantity: 10,
    exit_date: "2026-06-05",
    exit_price: 112,
    pnl: 120,
    pnl_pct: 12,
    holding_days: 4,
    stop_loss: 94,
    target_price: 118,
    risk_reward: 2,
    entry_reason: "Test setup",
    exit_reason: "Target partial",
    mistakes: null,
    lessons,
    status: "closed",
    source_page: "manual",
    source_context: null,
    scanner_context: null,
    thesis: null,
    invalidation_rule: null,
    created_at: "2026-06-01T09:30:00.000Z",
    updated_at: "2026-06-05T09:30:00.000Z",
  };
}

describe("buildDashboardActionBrief", () => {
  it("summarizes a ready desk with scanner as the next routine action", () => {
    const brief = buildDashboardActionBrief(base);
    expect(brief.headline).toBe("6/6 desk signals ready");
    expect(brief.nextAction.id).toBe("scanner");
    expect(brief.items.map((item) => item.status)).toEqual(["ready", "ready", "ready", "ready", "ready", "ready"]);
    expect(brief.items.map((item) => item.id)).toEqual(["market", "scanner", "watchlist", "risk", "journal", "import"]);
  });

  it("prioritizes data issues before trading actions", () => {
    const brief = buildDashboardActionBrief({
      ...base,
      marketDataStatus: "stale",
      accountIssueCount: 1,
      alertMatchSymbols: 3,
      watchlistReviewDue: 2,
    });
    expect(brief.nextAction.id).toBe("market");
    expect(brief.nextAction.href).toBe("/data");
    expect(brief.items.find((item) => item.id === "scanner")?.value).toBe("3 matches");
  });

  it("treats a failed market refresh as unconfirmed even with cached healthy data", () => {
    const brief = buildDashboardActionBrief({
      ...base,
      marketRefreshFailed: true,
    });
    const market = brief.items.find((item) => item.id === "market");
    expect(market).toMatchObject({ value: "Check data", href: "/data", status: "warn" });
    expect(brief.nextAction.id).toBe("market");
  });

  it("turns an empty account into a scanner-first starter checklist", () => {
    const brief = buildDashboardActionBrief({
      ...base,
      trackedSymbols: 0,
      scanAlerts: 0,
      closedTrades: 0,
      reviewedTrades: 0,
      openTrades: 0,
      brokerConnected: false,
      brokerName: null,
      brokerLastSyncedAt: null,
    });
    expect(brief.items.find((item) => item.id === "scanner")?.value).toBe("Run scan");
    expect(brief.items.find((item) => item.id === "watchlist")?.href).toBe("/scanner");
    expect(brief.items.find((item) => item.id === "import")?.status).toBe("warn");
  });

  it("surfaces unreviewed closed trades as journal action", () => {
    const brief = buildDashboardActionBrief({
      ...base,
      openTrades: 2,
      closedTrades: 7,
      reviewedTrades: 3,
    });
    const journal = brief.items.find((item) => item.id === "journal");
    expect(journal?.value).toBe("4 due");
    expect(journal?.status).toBe("action");
    expect(brief.items.find((item) => item.id === "risk")).toMatchObject({
      value: "2 open",
      detail: "Check stop, target, and invalidation",
      status: "action",
    });
    expect(brief.items.find((item) => item.id === "journal")).toMatchObject({
      value: "4 due",
      href: "/journal?review=needs-review",
      status: "action",
    });
  });

  it("does not invent full-history review debt from a partial journal sample", () => {
    const brief = buildDashboardActionBrief({
      ...base,
      closedTrades: 24,
      reviewedTrades: 24,
      knownUnreviewedTrades: 0,
      reviewCoveragePartial: true,
    });
    const journal = brief.items.find((item) => item.id === "journal");
    expect(journal?.value).toBe("Coverage partial");
    expect(journal?.detail).toMatch(/full-history review state is unknown/i);
    expect(journal?.status).toBe("warn");
  });

  it("carries only the top two priority symbols into the dashboard brief", () => {
    const brief = buildDashboardActionBrief({
      ...base,
      prioritySymbols: [
        prioritySymbol("A", 50),
        prioritySymbol("B", 40),
        prioritySymbol("C", 30),
        prioritySymbol("D", 20),
        prioritySymbol("E", 10),
      ],
    });

    expect(brief.prioritySymbols.map((item) => item.symbol)).toEqual(["A", "B"]);
  });

  it("keeps chart and watchlist handoffs visible in the dashboard priority queue", () => {
    expect(actionBriefSource).toContain("Review queue");
    expect(actionBriefSource).toContain("Continue workflow");
    expect(actionBriefSource).toContain("dashboard-priority-actions");
    expect(actionBriefSource).toContain("Open ${item.symbol} full chart");
    expect(actionBriefSource).toContain("{item.chartHref}");
    expect(actionBriefSource).toContain("Chart");
    expect(actionBriefSource).toContain("Review");
  });
});

describe("buildDashboardPrioritySymbols", () => {
  const now = new Date("2026-06-12T09:30:00.000Z");

  it("ranks actionable watchlist setups and skips ignored archive candidates", () => {
    const watchlists: Watchlist[] = [{
      id: "qa-list",
      name: "Codex QA Watchlist",
      sort_order: 0,
      created_at: "2026-06-12T09:30:00.000Z",
      items: [
        {
          symbol: "RELIANCE",
          sort_order: 0,
          added_at: "2026-06-12T09:30:00.000Z",
          company_name: "Reliance Industries",
          sector: "Energy",
          pct_change: 2.6,
          volume_ratio: 2.3,
          rsi_14: 64,
          pinned: true,
          tags: ["breakout"],
          note: "Fresh breakout candidate.",
        },
        {
          symbol: "TCS",
          sort_order: 1,
          added_at: "2026-04-01T09:30:00.000Z",
          pct_change: -0.4,
          volume_ratio: 0.8,
          rsi_14: 48,
          pinned: false,
          tags: [],
          note: "Rejected.",
        },
      ],
    }];
    const workflowStates: WorkflowState[] = [
      {
        symbol: "RELIANCE",
        lifecycle: "ready",
        confidence: 5,
        scanner_context: {
          source: "scanner",
          setup_score: 91,
          setup_grade: "A",
          rs_score: 84,
          captured_at: "2026-06-12T09:30:00.000Z",
        },
      },
      {
        symbol: "TCS",
        lifecycle: "ignored",
        ignored: true,
      },
    ];

    const queue = buildDashboardPrioritySymbols({
      watchlists,
      workflowStates,
      journalEntries: [],
      broker: { connected: true, tokenExpired: false, planAllowsBroker: true },
      now,
    });

    expect(queue.map((item) => item.symbol)).toEqual(["RELIANCE"]);
    expect(queue[0]).toMatchObject({
      companyName: "Reliance Industries",
      href: "/watchlist?id=qa-list&symbol=RELIANCE",
      chartHref: "/charts/RELIANCE?from=dashboard&full=1",
      label: "Act now",
    });
  });

  it("includes journal review debt in the symbol detail", () => {
    const watchlists: Watchlist[] = [{
      id: "journal-list",
      name: "Journal Review",
      sort_order: 0,
      created_at: "2026-06-12T09:30:00.000Z",
      items: [{
        symbol: "INFY",
        sort_order: 0,
        added_at: "2026-06-10T09:30:00.000Z",
        pct_change: 0.7,
        volume_ratio: 1.1,
        rsi_14: 56,
      }],
    }];
    const workflowStates: WorkflowState[] = [{
      symbol: "INFY",
      lifecycle: "watch",
      setup_quality: 3,
    }];

    const queue = buildDashboardPrioritySymbols({
      watchlists,
      workflowStates,
      journalEntries: [closedTrade("INFY", null)],
      now,
    });

    expect(queue[0]?.symbol).toBe("INFY");
    expect(queue[0]?.detail).toContain("Closed trade needs review");
  });
});
