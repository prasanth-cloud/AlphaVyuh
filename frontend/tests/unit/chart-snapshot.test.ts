import { describe, expect, it } from "vitest";

import {
  buildChartSnapshotMetadata,
  buildChartSnapshotState,
  cloneChartSnapshotState,
  normalizeJournalChartSnapshot,
} from "@/lib/chart-snapshot";

describe("chart snapshot metadata", () => {
  it("captures a lightweight chart entry reference for journal rows", () => {
    const snapshot = buildChartSnapshotMetadata("reliance", 2850.5);

    expect(snapshot.symbol).toBe("RELIANCE");
    expect(snapshot.chart_url).toBe("/charts/RELIANCE?full=1");
    expect(snapshot.entry_price).toBe(2850.5);
    expect(snapshot.captured_at).toBeTruthy();
  });

  it("deep-clones versioned decision state before it can be attached", () => {
    const original = buildChartSnapshotState({
      symbol: "reliance",
      timeframe: "D",
      range_label: "1Y",
      chart_type: "candles",
      visible_range: { from: 12, to: 90 },
      indicators: ["ema20", "ema50"],
      drawings: [{
        id: "drawing-1",
        tool: "Trendline",
        p1: { time: "2026-01-01", price: 120 },
        p2: { time: "2026-02-01", price: 135 },
        color: "#ffffff",
        locked: false,
        hidden: false,
      }],
      entry_price: 140,
      last_bar_time: "2026-07-15",
      data_source: "NSE EOD",
      data_mode: "eod",
      data_as_of: "2026-07-15",
      captured_at: "2026-07-16T12:00:00.000Z",
    });
    const clone = cloneChartSnapshotState(original);

    original.indicators.push("rsi");
    original.drawings[0]!.p1.price = 999;
    original.visible_range!.from = 0;

    expect(clone.schema_version).toBe(1);
    expect(clone.symbol).toBe("RELIANCE");
    expect(clone.indicators).toEqual(["ema20", "ema50"]);
    expect(clone.drawings[0]?.p1.price).toBe(120);
    expect(clone.visible_range?.from).toBe(12);
  });

  it("parses a valid stored response without trusting extra or malformed fields", () => {
    const parsed = normalizeJournalChartSnapshot({
      available: true,
      storage_path: "user/journal.json",
      captured_at: "2026-07-16T12:00:00.000Z",
      state: {
        schema_version: 1,
        symbol: "RELIANCE",
        timeframe: "D",
        range_label: "1Y",
        chart_type: "candles",
        visible_range: { from: 10, to: 20 },
        indicators: ["ema20", null, 42],
        drawings: [{ id: "bad" }],
        entry_price: 140,
        last_bar_time: "2026-07-15",
        data_source: "NSE EOD",
        data_mode: "future-mode",
        data_as_of: "2026-07-15",
        captured_at: "2026-07-16T12:00:00.000Z",
      },
    });

    expect(parsed.available).toBe(true);
    expect(parsed.state?.indicators).toEqual(["ema20"]);
    expect(parsed.state?.drawings).toEqual([]);
    expect(parsed.state?.data_mode).toBe("unknown");
  });

  it("fails closed for malformed stored state", () => {
    expect(normalizeJournalChartSnapshot({ available: true, state: { schema_version: 1 } })).toEqual({
      available: false,
      state: null,
      storage_path: null,
      captured_at: null,
    });
  });
});
