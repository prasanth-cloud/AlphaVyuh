import { LineSeries } from "lightweight-charts";
import type { IndicatorDef } from "../types";
import { toChartTime } from "../types";

type Params = { period: number };

export const sma: IndicatorDef<Params> = {
  type: "sma",
  label: "SMA",
  pane: "price",
  defaultParams: { period: 50 },
  compute(candles, params) {
    const out = [];
    let sum = 0;
    for (let index = 0; index < candles.length; index += 1) {
      sum += candles[index].close;
      if (index >= params.period) sum -= candles[index - params.period].close;
      if (index + 1 >= params.period) out.push({ time: candles[index].time, value: Number((sum / params.period).toFixed(4)) });
    }
    return out;
  },
  render(chart, _paneApi, data, style) {
    const series = chart.addSeries(LineSeries, {
      color: style.color ?? "#bac4d1",
      lineWidth: style.lineWidth ?? 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(data.map((point) => ({ time: toChartTime(point.time), value: "value" in point ? point.value : 0 })));
    return series;
  },
};
