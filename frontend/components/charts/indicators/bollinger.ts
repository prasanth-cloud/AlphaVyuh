import { LineSeries } from "lightweight-charts";
import type { IndicatorDef } from "../types";
import { toChartTime } from "../types";

type Params = { period: number; deviation: number };

export const bollinger: IndicatorDef<Params> = {
  type: "bollinger",
  label: "Bollinger Bands",
  pane: "price",
  defaultParams: { period: 20, deviation: 2 },
  compute(candles, params) {
    const out = [];
    for (let index = params.period - 1; index < candles.length; index += 1) {
      const window = candles.slice(index - params.period + 1, index + 1);
      const mean = window.reduce((sum, candle) => sum + candle.close, 0) / params.period;
      out.push({ time: candles[index].time, value: Number(mean.toFixed(4)) });
    }
    return out;
  },
  render(chart, _paneApi, data, style) {
    const series = chart.addSeries(LineSeries, {
      color: style.color ?? "#8b96a6",
      lineWidth: style.lineWidth ?? 1,
      lineStyle: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(data.map((point) => ({ time: toChartTime(point.time), value: "value" in point ? point.value : 0 })));
    return series;
  },
};
