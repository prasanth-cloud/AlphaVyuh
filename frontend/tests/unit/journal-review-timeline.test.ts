import { describe, expect, it } from "vitest";
import { buildJournalReviewTimeline } from "@/lib/journal-review-timeline";
import type { JournalChartSnapshot, JournalEntry } from "@/lib/api";

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "trade-1",
    user_id: "user-1",
    symbol: "RELIANCE",
    company_name: "Reliance Industries",
    trade_type: "long",
    setup_type: "breakout",
    entry_date: "2026-07-01T09:30:00Z",
    entry_price: 1500,
    quantity: 10,
    exit_date: "2026-07-08T10:00:00Z",
    exit_price: 1560,
    pnl: 600,
    pnl_pct: 4,
    holding_days: 7,
    stop_loss: 1470,
    target_price: 1590,
    risk_reward: 3,
    entry_reason: "Scanner: Stage 2",
    exit_reason: "Target area reached",
    mistakes: null,
    lessons: null,
    status: "closed",
    source_page: "scanner",
    source_context: "Stage 2 result",
    scanner_context: null,
    thesis: "Breakout above a tight base.",
    invalidation_rule: "Close below the pivot.",
    snapshot_state_path: "user-1/trade-1.json",
    snapshot_captured_at: "2026-07-01T09:31:00Z",
    review_schema_version: 1,
    planned_setup: "Stage 2 breakout",
    setup_adherence: "partial",
    rule_breaks: ["entry_outside_plan"],
    review_lesson: "Wait for the planned entry zone.",
    reviewed_at: "2026-07-09T11:00:00Z",
    created_at: "2026-07-01T09:30:00Z",
    updated_at: "2026-07-09T11:00:00Z",
    ...overrides,
  };
}

const snapshot: JournalChartSnapshot = {
  available: true,
  storage_path: "user-1/trade-1.json",
  captured_at: "2026-07-01T09:31:00Z",
  state: {
    schema_version: 1,
    symbol: "RELIANCE",
    timeframe: "1D",
    range_label: "1Y",
    chart_type: "candlestick",
    visible_range: null,
    indicators: ["EMA 20", "EMA 50"],
    drawings: [],
    entry_price: 1500,
    last_bar_time: "2026-06-30T10:00:00Z",
    data_source: "NSE EOD",
    data_mode: "live",
    data_as_of: "2026-06-30",
    captured_at: "2026-07-01T09:31:00Z",
  },
};

describe("journal review timeline", () => {
  it("connects the recorded plan, immutable entry context, outcome, adherence, and next adjustment", () => {
    const timeline = buildJournalReviewTimeline(entry(), snapshot);

    expect(timeline).toMatchObject({
      status: "complete",
      completedStages: 5,
      totalStages: 5,
    });
    expect(timeline.stages.map((stage) => stage.id)).toEqual([
      "plan",
      "entry-context",
      "outcome",
      "adherence",
      "adjustment",
    ]);
    expect(timeline.stages[0]).toMatchObject({
      state: "recorded",
      title: "Plan",
      primary: "Stage 2 breakout",
    });
    expect(timeline.stages[1]).toMatchObject({
      state: "recorded",
      title: "Entry context",
      primary: "1Y · 1D · candlestick",
    });
    expect(timeline.stages[1]?.details.join(" ")).toContain("NSE EOD");
    expect(timeline.stages[2]).toMatchObject({ state: "recorded", title: "Outcome" });
    expect(timeline.stages[2]?.primary).toContain("Gain ₹600");
    expect(timeline.stages[3]).toMatchObject({ state: "recorded", primary: "Partly followed" });
    expect(timeline.stages[3]?.details).toContain("Entry differed from plan");
    expect(timeline.stages[4]).toMatchObject({
      state: "recorded",
      primary: "Wait for the planned entry zone.",
    });
  });

  it("keeps missing and unavailable evidence explicit instead of inventing a complete review", () => {
    const timeline = buildJournalReviewTimeline(entry({
      snapshot_state_path: "user-1/trade-1.json",
      review_schema_version: null,
      planned_setup: null,
      setup_adherence: null,
      rule_breaks: null,
      review_lesson: null,
      reviewed_at: null,
    }), {
      available: false,
      state: null,
      storage_path: null,
      captured_at: null,
    });

    expect(timeline.status).toBe("needs-review");
    expect(timeline.completedStages).toBe(2);
    expect(timeline.stages[1]).toMatchObject({ state: "unavailable" });
    expect(timeline.stages[3]).toMatchObject({ state: "missing", primary: "Process review not recorded" });
    expect(timeline.stages[4]).toMatchObject({ state: "missing", primary: "Next adjustment not recorded" });
  });

  it("shows an open trade as in progress and never turns the model into trading advice", () => {
    const timeline = buildJournalReviewTimeline(entry({
      status: "open",
      exit_date: null,
      exit_price: null,
      pnl: null,
      pnl_pct: null,
      holding_days: null,
      exit_reason: null,
      review_schema_version: null,
      planned_setup: null,
      setup_adherence: null,
      rule_breaks: null,
      review_lesson: null,
      reviewed_at: null,
    }), null);

    expect(timeline.status).toBe("in-progress");
    expect(timeline.stages[2]).toMatchObject({ state: "pending", primary: "Trade remains open" });
    expect(JSON.stringify(timeline)).not.toMatch(/recommend|you should|buy now|sell now/i);
  });

  it("treats a snapshot that was never captured differently from a failed snapshot read", () => {
    const timeline = buildJournalReviewTimeline(entry({ snapshot_state_path: null, snapshot_captured_at: null }), null);

    expect(timeline.stages[1]).toMatchObject({
      state: "missing",
      primary: "Immutable entry context was not captured",
    });
  });
});
