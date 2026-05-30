import { describe, expect, it } from "vitest";
import {
  CHART_TIMEFRAME_OPTIONS,
  INTRADAY_UNAVAILABLE_MESSAGE,
  candleRangeMonths,
  formatChartCoverageRange,
  formatChartGranularity,
  formatCandleRange,
  getCoverageAvailabilityMessage,
  getFiveYearHistoryBadge,
  getRangeAvailabilityMessage,
  getWatchlistChartRequest,
  isIntradayTimeframe,
} from "@/lib/watchlist-chart-range";

const NOW = new Date("2026-05-07T12:00:00Z");

describe("watchlist chart range mapping", () => {
  it("maps short ranges to daily candle windows", () => {
    expect(getWatchlistChartRequest("3M", NOW)).toMatchObject({
      label: "3M",
      timeframe: "D",
      from_date: "2026-02-07",
      to_date: "2026-05-07",
      limit: 80,
    });
    expect(getWatchlistChartRequest("1Y", NOW)).toMatchObject({
      label: "1Y",
      timeframe: "D",
      from_date: "2025-05-07",
      to_date: "2026-05-07",
      limit: 270,
    });
  });

  it("uses compressed candle requests for multi-year ranges", () => {
    expect(getWatchlistChartRequest("3Y", NOW)).toMatchObject({
      timeframe: "W",
      from_date: "2023-05-07",
      limit: 170,
    });
    expect(getWatchlistChartRequest("5Y", NOW)).toMatchObject({
      timeframe: "D",
      from_date: "2021-05-07",
      limit: 1300,
    });
    expect(getWatchlistChartRequest("Max", NOW)).toMatchObject({
      timeframe: "M",
      from_date: "1900-01-01",
      limit: 3000,
    });
    expect(formatChartGranularity("D")).toBe("Daily");
    expect(formatChartGranularity("W")).toBe("Weekly");
    expect(formatChartGranularity("M")).toBe("Monthly");
  });

  it("exposes intraday options as unavailable in EOD data mode", () => {
    const intraday = CHART_TIMEFRAME_OPTIONS.filter((option) => option.group === "Intraday");
    expect(intraday.map((option) => option.label)).toEqual(["5m", "15m", "30m", "1h"]);
    expect(intraday.every((option) => option.disabled && option.unavailableReason === INTRADAY_UNAVAILABLE_MESSAGE)).toBe(true);
    expect(isIntradayTimeframe("15m")).toBe(true);
    expect(isIntradayTimeframe("1Y")).toBe(false);
  });

  it("reports the candle range and availability when history is short", () => {
    const candles = [{ time: "2026-02-01" }, { time: "2026-05-01" }];
    expect(formatCandleRange(candles)).toBe("2026-02-01 -> 2026-05-01");
    expect(Math.round(candleRangeMonths(candles))).toBe(3);
    expect(getRangeAvailabilityMessage(candles, { label: "1Y", expectedMonths: 12 })).toBe("Only 3 months available for 1Y.");
    expect(getRangeAvailabilityMessage(candles, { label: "3M", expectedMonths: 3 })).toBeNull();
  });

  it("uses structured coverage metadata when the API marks partial history", () => {
    const coverage = {
      available_from: "2026-02-01",
      available_to: "2026-05-01",
      returned_candles: 42,
      partial: true,
      partial_reason: "history_starts_after_requested_window",
      coverage_pct: 24.4,
      five_year_contract: { status: "partial" },
    };

    expect(formatChartCoverageRange(coverage, [])).toBe("2026-02-01 -> 2026-05-01 · 42 bars");
    expect(getCoverageAvailabilityMessage(coverage, { label: "1Y" })).toBe("History starts at 2026-02-01 for 1Y (24% coverage).");
  });

  it("labels partial 5Y contract coverage as limited history", () => {
    const coverage = {
      available_from: "2024-06-03",
      available_to: "2026-05-07",
      returned_candles: 480,
      partial: true,
      partial_reason: "five_year_contract_not_met",
      coverage_pct: 39.2,
      five_year_contract: { years: 5, status: "partial" },
    };

    expect(getFiveYearHistoryBadge(coverage, { label: "5Y" })).toEqual({
      label: "Limited 5Y history",
      title: "IPO, rename, or short-history symbol; 2024-06-03 -> 2026-05-07 · 480 bars · 39% coverage.",
      tone: "warn",
    });
    expect(getFiveYearHistoryBadge({ ...coverage, five_year_contract: { years: 5, status: "partial" } }, { label: "1Y" })).toBeNull();
  });

  it("labels met 5Y contract coverage as verified history", () => {
    const coverage = {
      available_from: "2021-05-07",
      available_to: "2026-05-07",
      returned_candles: 1288,
      partial: false,
      partial_reason: null,
      coverage_pct: 100,
      five_year_contract: { years: 5, status: "met" },
    };

    expect(getFiveYearHistoryBadge(coverage, { label: "5Y" })).toEqual({
      label: "5Y history verified",
      title: "Daily 5Y chart contract met: 2021-05-07 -> 2026-05-07 · 1288 bars.",
      tone: "good",
    });
  });
});
