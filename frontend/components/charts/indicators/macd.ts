import { HistogramSeries, LineSeries } from "lightweight-charts";
import type { IndicatorDef, SeriesData } from "../types";
import { toChartTime } from "../types";

type Params = { fast: number; slow: number; signal: number };

function emaValues(values: number[], period: number) {
  const k = 2 / (period + 1);
  let prev: number | null = null;
  return values.map((value) => {
    prev = prev == null ? value : value * k + prev * (1 - k);
    return prev;
  });
}

export const macd: IndicatorDef<Params> = {
  type: "macd",
  label: "MACD",
  pane: "below",
  defaultParams: { fast: 12, slow: 26, signal: 9 },
  compute(candles, params) {
    const closes = candles.map((candle) => candle.close);
    const fast = emaValues(closes, params.fast);
    const slow = emaValues(closes, params.slow);
    const macdLine = fast.map((value, index) => value - slow[index]);
    const signal = emaValues(macdLine, params.signal);
    return candles.flatMap((candle, index) => {
      if (index + 1 < params.slow) return [];
      const histogram = macdLine[index] - signal[index];
      return [{ time: candle.time, value: Number(histogram.toFixed(4)), color: histogram >= 0 ? "#26a65b66" : "#e5383b66" }];
    });
  },
  render(chart, _paneApi, data: SeriesData[], style) {
    const histogram = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    histogram.setData(data.map((point) => ({
      time: toChartTime(point.time),
      value: "value" in point ? point.value : 0,
      color: "color" in point ? point.color : style.color,
    })));
    const zero = chart.addSeries(LineSeries, { color: "#9ca3af55", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    zero.setData(data.map((point) => ({ time: toChartTime(point.time), value: 0 })));
    return histogram;
  },
};
