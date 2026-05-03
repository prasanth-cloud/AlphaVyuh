import { LineSeries } from "lightweight-charts";
import type { IndicatorDef } from "../types";
import { toChartTime } from "../types";

type Params = { period: number };

export const ema: IndicatorDef<Params> = {
  type: "ema",
  label: "EMA",
  pane: "price",
  defaultParams: { period: 20 },
  compute(candles, params) {
    const k = 2 / (params.period + 1);
    let prev: number | null = null;
    return candles.flatMap((candle, index) => {
      prev = prev == null ? candle.close : candle.close * k + prev * (1 - k);
      return index + 1 >= params.period ? [{ time: candle.time, value: Number(prev.toFixed(4)) }] : [];
    });
  },
  render(chart, _paneApi, data, style) {
    const series = chart.addSeries(LineSeries, {
      color: style.color ?? "#f4f7fb",
      lineWidth: style.lineWidth ?? 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(data.map((point) => ({ time: toChartTime(point.time), value: "value" in point ? point.value : 0 })));
    return series;
  },
};
