import { HistogramSeries } from "lightweight-charts";
import type { IndicatorDef } from "../types";
import { toChartTime } from "../types";

export const volume: IndicatorDef<Record<string, never>> = {
  type: "volume",
  label: "Volume",
  pane: "below",
  defaultParams: {},
  compute(candles) {
    return candles.map((candle) => ({
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? "rgba(34,197,94,0.42)" : "rgba(239,68,68,0.42)",
    }));
  },
  render(chart, _paneApi, data, style) {
    const series = chart.addSeries(HistogramSeries, {
      color: style.color ?? "rgba(148,163,184,0.45)",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(data.map((point) => ({
      time: toChartTime(point.time),
      value: "value" in point ? point.value : 0,
      color: "color" in point ? point.color : undefined,
    })));
    return series;
  },
};
