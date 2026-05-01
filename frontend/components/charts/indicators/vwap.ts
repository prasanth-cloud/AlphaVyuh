import { LineSeries } from "lightweight-charts";
import type { IndicatorDef } from "../types";
import { toChartTime } from "../types";

export const vwap: IndicatorDef<Record<string, never>> = {
  type: "vwap",
  label: "VWAP",
  pane: "price",
  defaultParams: {},
  compute(candles) {
    let pv = 0;
    let volume = 0;
    return candles.flatMap((candle) => {
      const typical = (candle.high + candle.low + candle.close) / 3;
      pv += typical * candle.volume;
      volume += candle.volume;
      return volume > 0 ? [{ time: candle.time, value: Number((pv / volume).toFixed(4)) }] : [];
    });
  },
  render(chart, _paneApi, data, style) {
    const series = chart.addSeries(LineSeries, {
      color: style.color ?? "#d6dce5",
      lineWidth: style.lineWidth ?? 2,
      lineStyle: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(data.map((point) => ({ time: toChartTime(point.time), value: "value" in point ? point.value : 0 })));
    return series;
  },
};
