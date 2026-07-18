import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JournalReviewTimeline } from "@/app/(app)/journal/components/JournalReviewTimeline";
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

describe("JournalReviewTimeline", () => {
  it("renders the complete evidence sequence and immutable-context trust copy", () => {
    const html = renderToStaticMarkup(createElement(JournalReviewTimeline, {
      entry: entry(),
      snapshot,
      snapshotLoading: false,
      snapshotError: null,
    }));

    expect(html).toContain('data-testid="journal-review-timeline"');
    expect(html).toContain("5/5 recorded");
    expect(html).toContain("Review complete");
    expect(html).toContain(">Plan<");
    expect(html).toContain(">Entry context<");
    expect(html).toContain(">Outcome<");
    expect(html).toContain(">Adherence<");
    expect(html).toContain(">Next adjustment<");
    expect(html).toContain('data-testid="journal-immutable-chart-context"');
    expect(html).toContain("structured chart state, not a screenshot");
  });

  it("shows snapshot loading as pending instead of flashing unavailable", () => {
    const html = renderToStaticMarkup(createElement(JournalReviewTimeline, {
      entry: entry(),
      snapshot: null,
      snapshotLoading: true,
      snapshotError: null,
    }));

    expect(html).toContain("Loading immutable entry context");
    expect(html).toContain('data-state="pending"');
    expect(html).not.toContain("Immutable entry context is unavailable");
  });
});
