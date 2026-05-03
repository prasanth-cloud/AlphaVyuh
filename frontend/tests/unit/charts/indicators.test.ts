import { describe, expect, it } from "vitest";
import type { Candle } from "@/components/charts/types";
import { ema } from "@/components/charts/indicators/ema";
import { macd } from "@/components/charts/indicators/macd";
import { rsi } from "@/components/charts/indicators/rsi";
import { sma } from "@/components/charts/indicators/sma";
import { volume } from "@/components/charts/indicators/volume";
import { vwap } from "@/components/charts/indicators/vwap";

const candles: Candle[] = [
  { time: "2026-01-01", open: 9, high: 11, low: 8, close: 10, volume: 100 },
  { time: "2026-01-02", open: 10, high: 12, low: 9, close: 11, volume: 200 },
  { time: "2026-01-03", open: 11, high: 13, low: 10, close: 12, volume: 300 },
  { time: "2026-01-04", open: 12, high: 14, low: 11, close: 13, volume: 400 },
  { time: "2026-01-05", open: 13, high: 15, low: 12, close: 14, volume: 500 },
  { time: "2026-01-06", open: 14, high: 16, low: 13, close: 15, volume: 600 },
];

describe("chart indicators", () => {
  it("computes SMA", () => {
    expect(sma.compute(candles, { period: 3 })).toEqual([
      { time: "2026-01-03", value: 11 },
      { time: "2026-01-04", value: 12 },
      { time: "2026-01-05", value: 13 },
      { time: "2026-01-06", value: 14 },
    ]);
  });

  it("computes EMA", () => {
    expect(ema.compute(candles, { period: 3 }).map((point) => "value" in point ? point.value : null)).toEqual([11.25, 12.125, 13.0625, 14.0313]);
  });

  it("computes VWAP", () => {
    expect(vwap.compute(candles.slice(0, 2), {}).map((point) => "value" in point ? point.value : null)).toEqual([9.6667, 10.3333]);
  });

  it("computes RSI", () => {
    expect(rsi.compute(candles, { period: 3 }).map((point) => "value" in point ? point.value : null)).toEqual([100, 100, 100]);
  });

  it("computes MACD histogram", () => {
    const data = macd.compute(candles, { fast: 2, slow: 3, signal: 2 });
    expect(data.map((point) => "value" in point ? point.value : null)).toEqual([0.0648, 0.0509, 0.0337, 0.0203]);
  });

  it("computes volume colors", () => {
    expect(volume.compute(candles.slice(0, 1), {})).toEqual([
      { time: "2026-01-01", value: 100, color: "rgba(34,197,94,0.42)" },
    ]);
  });
});
