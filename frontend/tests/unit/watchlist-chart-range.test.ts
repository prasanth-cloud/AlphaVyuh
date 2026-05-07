import { describe, expect, it } from "vitest";
import {
  candleRangeMonths,
  formatCandleRange,
  getRangeAvailabilityMessage,
  getFullChartRequest,
  isIntradayTimeframe,
  getWatchlistChartRequest,
} from "@/lib/watchlist-chart-range";

const NOW = new Date("2026-05-07T12:00:00Z");

describe("watchlist chart range mapping", () => {
  it("maps short ranges to daily EOD candle windows", () => {
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

  it("uses weekly or monthly compression for multi-year ranges", () => {
    expect(getWatchlistChartRequest("3Y", NOW)).toMatchObject({
      timeframe: "W",
      from_date: "2023-05-07",
      limit: 170,
    });
    expect(getWatchlistChartRequest("10Y", NOW)).toMatchObject({
      timeframe: "M",
      from_date: "2016-05-07",
      limit: 130,
    });
  });

  it("shares full-chart EOD range mapping and marks intraday unavailable", () => {
    expect(getFullChartRequest("5m", NOW)).toBeNull();
    expect(isIntradayTimeframe("1h")).toBe(true);
    expect(getFullChartRequest("5Y", NOW)).toMatchObject({
      label: "5Y",
      timeframe: "W",
      from_date: "2021-05-07",
      limit: 270,
      expectedMonths: 60,
    });
  });

  it("reports the candle range and availability when history is short", () => {
    const candles = [{ time: "2026-02-01" }, { time: "2026-05-01" }];
    expect(formatCandleRange(candles)).toBe("2026-02-01 -> 2026-05-01");
    expect(Math.round(candleRangeMonths(candles))).toBe(3);
    expect(getRangeAvailabilityMessage(candles, { label: "1Y", expectedMonths: 12 })).toBe("Only 3 months available for 1Y.");
    expect(getRangeAvailabilityMessage(candles, { label: "3M", expectedMonths: 3 })).toBeNull();
  });
});
