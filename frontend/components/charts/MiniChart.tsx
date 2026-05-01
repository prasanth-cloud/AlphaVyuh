"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  BarSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
} from "lightweight-charts";
import type { CandleBar } from "@/lib/api";
import { indicatorKey, indicatorLabel, indicatorRegistry } from "./indicators";
import type { ChartIndicator, SeriesData } from "./types";

type Props = {
  candles: CandleBar[];
  height?: number;
  dark?: boolean;
  chartType?: "candles" | "bars" | "line";
  indicators?: ChartIndicator[];
};

function lineData(data: SeriesData[]) {
  return data
    .filter((point): point is { time: string; value: number; color?: string } => "value" in point)
    .map((point) => ({ time: point.time as import("lightweight-charts").Time, value: point.value, color: point.color }));
}

function BelowPane({ candles, indicator, height, dark }: { candles: CandleBar[]; indicator: ChartIndicator; height: number; dark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    const def = indicatorRegistry[indicator.type];
    return def.compute(candles, { ...def.defaultParams, ...(indicator.params ?? {}) } as never);
  }, [candles, indicator]);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    const bg   = dark ? "#040507" : "#ffffff";
    const grid = dark ? "rgba(255,255,255,0.055)" : "#f2f2f0";
    const text = dark ? "#7a8695" : "#999";
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: grid },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, rightOffset: 2, timeVisible: false, visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    if (indicator.type === "macd" || indicator.type === "volume") {
      const series = chart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: indicator.type === "volume" ? { type: "volume" } : undefined,
      });
      series.setData(lineData(data));
    } else {
      const series = chart.addSeries(LineSeries, {
        color: "#f4f7fb",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      if (indicator.type === "rsi") {
        series.createPriceLine({ price: 70, color: "#e5383b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        series.createPriceLine({ price: 30, color: "#26a65b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      }
      series.setData(lineData(data));
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      chart.remove();
      ro.disconnect();
    };
  }, [data, dark, height, indicator.type]);

  return (
    <div style={{ height, position: "relative", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <span className="label" style={{ position: "absolute", top: 4, left: 8, zIndex: 1 }}>{indicatorLabel(indicator)}</span>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

export default function MiniChart({ candles, height = 200, dark = true, chartType = "candles", indicators = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const priceIndicators = indicators.filter((indicator) => indicatorRegistry[indicator.type]?.pane === "price");
  const belowIndicators = indicators.filter((indicator) => indicatorRegistry[indicator.type]?.pane === "below");
  const priceIndicatorKey = priceIndicators.map(indicatorKey).join("|");
  const priceHeight = Math.max(180, height - belowIndicators.length * 96);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

    const bg   = dark ? "#040507" : "#ffffff";
    const grid = dark ? "rgba(255,255,255,0.055)" : "#f2f2f0";
    const text = dark ? "#7a8695" : "#999";

    const chart: IChartApi = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: priceHeight,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: grid },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderVisible: false, rightOffset: 2, timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    const priceSeries = chartType === "bars"
      ? chart.addSeries(BarSeries, {
          upColor: "#26a65b",
          downColor: "#e5383b",
          thinBars: false,
        })
      : chartType === "line"
        ? chart.addSeries(LineSeries, {
            color: "#f4f7fb",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          })
        : chart.addSeries(CandlestickSeries, {
            upColor: "#26a65b",
            downColor: "#e5383b",
            wickUpColor: "#26a65b",
            wickDownColor: "#e5383b",
            borderVisible: false,
          });

    const ohlcData = candles.map(c => ({
      time: c.time as import("lightweight-charts").Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const lineData = candles.map(c => ({
      time: c.time as import("lightweight-charts").Time,
      value: c.close,
    }));

    priceSeries.setData(chartType === "line" ? lineData : ohlcData);

    priceIndicators.forEach((indicator, index) => {
      const def = indicatorRegistry[indicator.type];
      const data = def.compute(candles, { ...def.defaultParams, ...(indicator.params ?? {}) } as never);
      if (data.length < 2) return;
      const palette = ["#f4f7fb", "#bac4d1", "#7a8695", "#d6dce5"];
      def.render(chart, null, data, { color: palette[index % palette.length], lineWidth: 2 });
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      chart.remove();
      ro.disconnect();
    };
  }, [candles, priceHeight, dark, chartType, priceIndicators, priceIndicatorKey]);

  return (
    <div className="w-full" style={{ height, display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} className="w-full" style={{ height: priceHeight, minHeight: 0 }} />
      {belowIndicators.map((indicator) => (
        <BelowPane key={indicatorKey(indicator)} candles={candles} indicator={indicator} height={96} dark={dark} />
      ))}
    </div>
  );
}
