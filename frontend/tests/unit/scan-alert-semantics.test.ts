import { describe, expect, it } from "vitest";
import { describeScanAlertCadence, describeScanAlertIntent } from "@/lib/scan-alert-semantics";

describe("scan alert semantics", () => {
  it("labels breakout and trend screens as entry setup watches", () => {
    expect(describeScanAlertIntent({
      all_smas_bullish: true,
      rs_score_min: "70",
      week_52_high_pct_max: 10,
      series: ["EQ"],
    })).toEqual({
      label: "Entry setup watch",
      detail: "Tracks cash-equity setups that may deserve chart review, shortlist, or watchlist action.",
      tone: "entry",
    });
  });

  it("labels breakdown and weakness screens as exit or risk review", () => {
    expect(describeScanAlertIntent({
      pct_change_max: "-2",
      price_vs_ema50: "below",
      series: ["EQ"],
    })).toEqual({
      label: "Exit / risk review",
      detail: "Flags cash-equity names that may need trim, stop, or invalidation review after the EOD scan.",
      tone: "exit",
    });
  });

  it("falls back to a neutral review watch for broad screens", () => {
    expect(describeScanAlertIntent({ sector: "Energy", series: ["EQ"] })).toEqual({
      label: "Review watch",
      detail: "Tracks this saved cash-equity screen once fresh EOD data is available.",
      tone: "review",
    });
  });

  it("describes active, paused, skipped, and failed session cadence", () => {
    expect(describeScanAlertCadence({ is_active: true })).toBe(
      "Active: checks once after each completed cash-equity EOD session.",
    );
    expect(describeScanAlertCadence({ is_active: false })).toBe(
      "Paused: this screen will not run after the next completed EOD session.",
    );
    expect(describeScanAlertCadence({ is_active: true, last_run_status: "skipped" })).toBe(
      "Active: waits for the next complete cash-equity EOD session.",
    );
    expect(describeScanAlertCadence({ is_active: true, last_run_status: "failed" })).toBe(
      "Active: retries after the next completed EOD session when alert data is available.",
    );
  });
});
