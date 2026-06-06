import { describe, expect, it } from "vitest";
import { buildWatchlistTriageSummary } from "@/lib/watchlist-triage";

describe("watchlist triage", () => {
  const now = new Date("2026-05-31T09:30:00.000Z");

  it("prioritizes pinned fresh scanner setups with volume confirmation", () => {
    const summary = buildWatchlistTriageSummary({
      symbol: "RELIANCE",
      sort_order: 2,
      added_at: "2026-05-30T09:30:00.000Z",
      sector: "Energy",
      pct_change: 2.4,
      volume_ratio: 2.2,
      rsi_14: 62,
    }, {
      now,
      meta: { pinned: true, tags: ["breakout"] },
      workflow: {
        symbol: "RELIANCE",
        lifecycle: "ready",
        setup_quality: 5,
        confidence: 4,
        scanner_context: {
          source: "scanner",
          setup_score: 88,
          setup_grade: "A",
          rs_score: 82,
          captured_at: "2026-05-30T09:30:00.000Z",
        },
      },
    });

    expect(summary.label).toBe("Act now");
    expect(summary.score).toBeGreaterThan(200);
    expect(summary.reasons).toEqual(expect.arrayContaining([
      "Pinned",
      "Plan ready",
      "A 88 scanner score",
      "RS 82",
      "Energy sector context",
    ]));
  });

  it("keeps ignored or invalidated names at the bottom of review priority", () => {
    const summary = buildWatchlistTriageSummary({
      symbol: "TCS",
      sort_order: 0,
      added_at: "2026-04-01T09:30:00.000Z",
      pct_change: 1.5,
      volume_ratio: 2.4,
      rsi_14: 66,
    }, {
      now,
      workflow: {
        symbol: "TCS",
        lifecycle: "ignored",
        ignored: true,
        scanner_context: {
          source: "scanner",
          setup_score: 92,
          setup_grade: "A",
          captured_at: "2026-04-01T09:30:00.000Z",
        },
      },
      meta: { note: "Rejected after review." },
    });

    expect(summary.label).toBe("Archive check");
    expect(summary.reasons).toContain("Ignored");
  });

  it("raises review debt when closed trades need lesson coverage", () => {
    const summary = buildWatchlistTriageSummary({
      symbol: "INFY",
      sort_order: 1,
      added_at: "2026-05-25T09:30:00.000Z",
      pct_change: 0.3,
      volume_ratio: 1.1,
      rsi_14: 54,
    }, {
      now,
      reviewState: { state: "needs-review", closed: 2, reviewed: 0 },
      workflow: {
        symbol: "INFY",
        lifecycle: "watch",
        setup_quality: 3,
      },
    });

    expect(summary.reasons).toContain("Closed trade needs review");
    expect(summary.label).toMatch(/Review next|Monitor/);
  });

  it("raises broker readiness context for actionable watchlist plans", () => {
    const summary = buildWatchlistTriageSummary({
      symbol: "AUBANK",
      sort_order: 3,
      added_at: "2026-05-31T09:30:00.000Z",
      sector: "Financial Services",
      pct_change: 0.8,
      volume_ratio: 1.4,
      rsi_14: 58,
    }, {
      now,
      broker: {
        connected: false,
        tokenExpired: true,
        planAllowsBroker: true,
        statusError: null,
      },
      workflow: {
        symbol: "AUBANK",
        lifecycle: "triggered",
        entry: 710,
        setup_quality: 4,
        confidence: 4,
        scanner_context: {
          source: "scanner",
          rs_score: 76,
          captured_at: "2026-05-31T09:30:00.000Z",
        },
      },
      meta: { note: "Breakout alert confirmed." },
    });

    expect(summary.reasons).toEqual(expect.arrayContaining([
      "Trigger hit",
      "RS 76",
      "Financial Services sector context",
      "Broker reconnect needed",
    ]));
    expect(summary.label).toMatch(/Act now|Review next/);
  });
});
