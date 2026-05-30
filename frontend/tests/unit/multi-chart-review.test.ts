import { describe, expect, it } from "vitest";
import {
  buildMultiChartAnalysisSummary,
  buildMultiChartAlertDraft,
  buildMultiChartDecisionNote,
  buildMultiChartDecisionPatch,
  buildMultiChartReviewHref,
  buildMultiChartTrustContext,
  normalizeMultiChartSymbols,
  tradingViewNseSymbols,
} from "@/lib/multi-chart-review";
import type { CandleBar, CandlesResponse, ScannerIdeaContext } from "@/lib/api";

function candlesFrom(start: string, count: number, closeAt: (index: number) => number): CandleBar[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    const close = closeAt(index);
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + index,
      ema_20: close - 3,
      ema_50: close - 6,
      ema_200: close - 12,
    };
  });
}

function candleResponse(overrides: Partial<CandlesResponse> = {}): CandlesResponse {
  const candles = candlesFrom("2025-01-01", 420, (index) => 100 + index * 0.25);
  const last = candles.at(-1)!;
  return {
    symbol: "RELIANCE",
    company_name: "Reliance Industries",
    sector: "Energy",
    timeframe: "D",
    candles,
    latest: {
      close: last.close,
      pct_change: 1.2,
      volume: last.volume,
      volume_ratio: 1.8,
      rsi_14: 62.4,
      ema_20: last.ema_20 ?? null,
      ema_50: last.ema_50 ?? null,
      ema_200: last.ema_200 ?? null,
      atr_14: 12,
      week_52_high: last.close * 1.05,
      week_52_low: last.close * 0.72,
      open: last.open,
      high: last.high,
      low: last.low,
      prev_close: last.close - 1,
    },
    ...overrides,
  };
}

function scannerContext(overrides: Partial<ScannerIdeaContext> = {}): ScannerIdeaContext {
  return {
    source: "scanner",
    preset_id: "trend-template",
    preset_name: "Trend Template",
    match_reasons: ["All moving averages aligned with 52W proximity."],
    confidence_reasons: ["RS and volume confirmed."],
    data_warnings: [],
    setup_score: 86,
    setup_grade: "A",
    confidence_label: "High confidence",
    rs_score: 86,
    price_perf_6m_pct: 32.4,
    week_52_high_pct: 5,
    volume_ratio: 1.8,
    rsi_14: 62.4,
    scan_trade_date: "2026-05-07",
    data_source: "NSE bhavcopy",
    data_mode: "eod",
    data_as_of: "2026-05-07",
    captured_at: "2026-05-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("multi-chart review helpers", () => {
  it("normalizes, deduplicates, and caps chart review symbols", () => {
    expect(normalizeMultiChartSymbols("nse:reliance, INFY tcs INFY hdfcbank icicibank")).toEqual([
      "RELIANCE",
      "INFY",
      "TCS",
      "HDFCBANK",
    ]);
  });

  it("builds a chart review href with watchlist provenance", () => {
    expect(buildMultiChartReviewHref(["RELIANCE", "INFY"], {
      source: "watchlist",
      watchlistId: "wl-1",
      watchlistName: "Rotation queue",
    })).toBe("/charts?symbols=RELIANCE%2CINFY&from=watchlist&watchlistId=wl-1&watchlist=Rotation+queue");
  });

  it("keeps board URLs limited to the first four visible queue symbols", () => {
    expect(buildMultiChartReviewHref(["RELIANCE", "INFY", "TCS", "HDFCBANK", "ICICIBANK"], {
      source: "watchlist",
      watchlistName: "Filtered desk",
    })).toBe("/charts?symbols=RELIANCE%2CINFY%2CTCS%2CHDFCBANK&from=watchlist&watchlist=Filtered+desk");
  });

  it("formats TradingView-compatible NSE symbols", () => {
    expect(tradingViewNseSymbols(["RELIANCE", "NSE:INFY"])).toBe("NSE:RELIANCE,NSE:INFY");
  });

  it("builds board decision patches without losing existing tags or review rationale", () => {
    const analysis = buildMultiChartAnalysisSummary(candleResponse(), {
      source: "scanner",
      rs_score: 86,
      week_52_high_pct: 5,
      volume_ratio: 1.8,
    });
    const trust = buildMultiChartTrustContext(candleResponse({
      source_metadata: {
        source_name: "NSE bhavcopy",
        mode: "eod",
        as_of: "2026-05-07",
      },
    }), {
      label: "5Y",
      timeframe: "D",
      expectedMonths: 60,
    });

    expect(buildMultiChartDecisionPatch("nse:reliance", "ready", {
      source: "scanner",
      existingTags: ["scan-vcp"],
      existingNotes: "Manual note stays.",
      analysis,
      alertDraft: buildMultiChartAlertDraft(candleResponse(), analysis),
      trust,
      scannerContext: scannerContext(),
      rangeLabel: "5Y",
    })).toMatchObject({
      symbol: "RELIANCE",
      lifecycle: "ready",
      source: "scanner",
      watchlist_id: null,
      ignored: false,
      review_later: false,
      tags: ["scan-vcp", "multi-chart-ready"],
      notes: expect.stringContaining("Manual note stays.\n[Multi-chart review] Ready · 5Y board · 6/6 checks · Weekly/monthly aligned"),
      scanner_context: expect.objectContaining({
        preset_name: "Trend Template",
        rs_score: 86,
      }),
    });
    expect(buildMultiChartDecisionPatch("nse:reliance", "ready", {
      analysis,
      scannerContext: scannerContext(),
      rangeLabel: "5Y",
    }).notes).toContain("Original scan Trend Template · All moving averages aligned with 52W proximity.");
    expect(buildMultiChartDecisionPatch("nse:reliance", "ready", {
      analysis,
      alertDraft: buildMultiChartAlertDraft(candleResponse(), analysis),
      rangeLabel: "5Y",
    }).notes).toContain("Alert 52W breakout");

    expect(buildMultiChartDecisionPatch("INFY", "invalidated", {
      source: "watchlist",
      watchlistId: "wl-1",
    })).toMatchObject({
      symbol: "INFY",
      lifecycle: "invalidated",
      source: "watchlist",
      watchlist_id: "wl-1",
      ignored: true,
      review_later: false,
      tags: ["multi-chart-invalidated"],
    });
  });

  it("replaces prior board-generated notes while preserving user notes", () => {
    const note = buildMultiChartDecisionNote("review_later", {
      existingNotes: "My thesis remains.\n[Multi-chart review] Ready · 5Y board · stale.",
      analysis: buildMultiChartAnalysisSummary(candleResponse({
        latest: {
          close: 100,
          pct_change: -0.4,
          volume: 1000,
          volume_ratio: 0.7,
          rsi_14: 38,
          ema_20: 105,
          ema_50: 110,
          ema_200: 120,
          atr_14: 4,
          week_52_high: 130,
          week_52_low: 85,
          open: 99,
          high: 102,
          low: 98,
          prev_close: 101,
        },
      }), null),
      rangeLabel: "3Y",
    });

    expect(note).toContain("My thesis remains.");
    expect(note).toContain("[Multi-chart review] Later · 3Y board");
    expect(note).toContain("Needs");
    expect(note).not.toContain("stale");
  });

  it("summarizes launch-grade multi-chart analysis context", () => {
    const summary = buildMultiChartAnalysisSummary(candleResponse(), {
      source: "scanner",
      rs_score: 86,
      week_52_high_pct: 5,
      volume_ratio: 1.8,
    });

    expect(summary).toMatchObject({
      playbookStatus: "ready",
      playbookDetail: "Weekly/monthly aligned",
      reviewScore: {
        passed: 6,
        total: 6,
        label: "6/6 checks",
        tone: "good",
        blockers: [],
      },
    });
    expect(summary?.metrics).toEqual(expect.arrayContaining([
      { label: "RS", value: "86", tone: "good" },
      { label: "MA", value: "3/3 above", tone: "good" },
      { label: "Volume", value: "1.80x", tone: "good" },
    ]));
    expect(summary?.checklist.join(" ")).toContain("Weekly/monthly");
    expect(summary?.checklist.join(" ")).toContain("RS score: 86");
    expect(summary?.checklist).toContain("Review score: 6/6 checks");
  });

  it("drafts alert levels from nearby 52-week breakout and invalidation context", () => {
    const data = candleResponse();
    const analysis = buildMultiChartAnalysisSummary(data, {
      source: "scanner",
      rs_score: 86,
      week_52_high_pct: 5,
      volume_ratio: 1.8,
    });
    const draft = buildMultiChartAlertDraft(data, analysis);

    expect(draft).toMatchObject({
      triggerLabel: "52W breakout",
      invalidationLabel: "50 EMA",
      tone: "good",
    });
    expect(draft?.triggerPrice).toBeGreaterThan(data.latest!.week_52_high!);
    expect(draft?.invalidationPrice).toBe(data.latest!.ema_50);
    expect(draft?.detail).toContain("52W breakout alert");
  });

  it("falls back to follow-through alerts when 52-week context is unavailable", () => {
    const data = candleResponse({
      latest: {
        ...candleResponse().latest!,
        close: 120,
        week_52_high: null,
        ema_50: null,
        atr_14: 6,
      },
    });
    const draft = buildMultiChartAlertDraft(data, null);

    expect(draft).toMatchObject({
      triggerLabel: "follow-through",
      invalidationLabel: "ATR support",
      triggerPrice: 123,
      invalidationPrice: 111,
      tone: "muted",
    });
  });

  it("marks five-year daily review history as launch-contract evidence", () => {
    const summary = buildMultiChartTrustContext(candleResponse({
      source: "nse-bhavcopy",
      source_metadata: {
        source_name: "NSE bhavcopy",
        mode: "eod",
        as_of: "2026-05-07",
      },
      coverage: {
        requested_from: "2021-05-07",
        requested_to: "2026-05-07",
        available_from: "2021-05-07",
        available_to: "2026-05-07",
        returned_candles: 1234,
        requested_limit: 1300,
        timeframe: "D",
        coverage_pct: 100,
        partial: false,
        source_name: "NSE bhavcopy",
        as_of: "2026-05-07",
      },
    }), {
      label: "5Y",
      timeframe: "D",
      expectedMonths: 60,
    });

    expect(summary).toMatchObject({
      sourceLabel: "NSE bhavcopy",
      asOf: "2026-05-07",
      coverageLabel: "2021-05-07 -> 2026-05-07 · 1234 bars",
      granularityLabel: "Daily candles",
      availabilityMessage: null,
      contractLabel: "5Y daily contract ready",
      contractTone: "good",
    });
  });

  it("warns when the review board has short five-year history", () => {
    const summary = buildMultiChartTrustContext(candleResponse({
      candles: candlesFrom("2025-01-01", 120, (index) => 100 + index * 0.2),
      coverage: {
        requested_from: "2021-05-07",
        requested_to: "2026-05-07",
        available_from: "2025-01-01",
        available_to: "2025-06-01",
        returned_candles: 120,
        requested_limit: 1300,
        timeframe: "D",
        coverage_pct: 12,
        partial: true,
        partial_reason: "history_starts_after_requested_window",
        source_name: "NSE bhavcopy",
        as_of: "2025-06-01",
      },
    }), {
      label: "5Y",
      timeframe: "D",
      expectedMonths: 60,
    });

    expect(summary).toMatchObject({
      availabilityMessage: "History starts at 2025-01-01 for 5Y (12% coverage).",
      contractLabel: "5Y daily history limited",
      contractTone: "warn",
    });
  });

  it("does not treat shorter review ranges as five-year launch proof", () => {
    const summary = buildMultiChartTrustContext(candleResponse(), {
      label: "1Y",
      timeframe: "D",
      expectedMonths: 12,
    });

    expect(summary).toMatchObject({
      contractLabel: "5Y launch contract not selected",
      contractTone: "muted",
    });
  });

  it("keeps RS pending when a board is opened without scanner context", () => {
    const summary = buildMultiChartAnalysisSummary(candleResponse(), null);

    expect(summary?.metrics).toEqual(expect.arrayContaining([
      { label: "RS", value: "Pending", tone: "muted" },
    ]));
    expect(summary?.reviewScore).toMatchObject({
      passed: 5,
      total: 6,
      label: "5/6 checks",
      tone: "good",
      blockers: ["RS pending"],
    });
    expect(summary?.checklist).toContain("RS score: pending scanner context");
  });

  it("surfaces blockers when a candidate is not launch-grade", () => {
    const candles = candlesFrom("2026-01-01", 20, (index) => 100 - index * 0.4).map((candle) => ({
      ...candle,
      ema_20: candle.close + 2,
      ema_50: candle.close + 4,
      ema_200: candle.close + 8,
    }));
    const last = candles.at(-1)!;
    const summary = buildMultiChartAnalysisSummary(candleResponse({
      candles,
      latest: {
        close: last.close,
        pct_change: -1.2,
        volume: last.volume,
        volume_ratio: 0.8,
        rsi_14: 38,
        ema_20: last.ema_20 ?? null,
        ema_50: last.ema_50 ?? null,
        ema_200: last.ema_200 ?? null,
        atr_14: 10,
        week_52_high: last.close * 1.25,
        week_52_low: last.close * 0.82,
        open: last.open,
        high: last.high,
        low: last.low,
        prev_close: last.close + 1,
      },
    }), {
      source: "scanner",
      rs_score: 42,
      volume_ratio: 0.8,
    });

    expect(summary?.reviewScore).toMatchObject({
      passed: 0,
      total: 6,
      label: "0/6 checks",
      tone: "muted",
    });
    expect(summary?.reviewScore.blockers).toEqual(expect.arrayContaining([
      "W/M need more history",
      "RS 42",
      expect.stringMatching(/^52W /),
      "MA 0/3 above",
      "Volume 0.80x",
      "RSI 38.0",
    ]));
  });
});
