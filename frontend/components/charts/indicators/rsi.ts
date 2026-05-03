import { LineSeries } from "lightweight-charts";
import type { IndicatorDef } from "../types";
import { toChartTime } from "../types";

type Params = { period: number };

export const rsi: IndicatorDef<Params> = {
  type: "rsi",
  label: "RSI",
  pane: "below",
  defaultParams: { period: 14 },
  compute(candles, params) {
    let avgGain = 0;
    let avgLoss = 0;
    const out = [];
    for (let index = 1; index < candles.length; index += 1) {
      const change = candles[index].close - candles[index - 1].close;
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);
      if (index <= params.period) {
        avgGain += gain / params.period;
        avgLoss += loss / params.period;
        if (index < params.period) continue;
      } else {
        avgGain = (avgGain * (params.period - 1) + gain) / params.period;
        avgLoss = (avgLoss * (params.period - 1) + loss) / params.period;
      }
      const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      out.push({ time: candles[index].time, value: Number(value.toFixed(4)) });
    }
    return out;
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
