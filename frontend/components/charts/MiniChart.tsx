"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  BarSeries,
  CandlestickSeries,
  LineSeries,
} from "lightweight-charts";
import type { CandleBar } from "@/lib/api";

type Props = {
  candles: CandleBar[];
  height?: number;
  dark?: boolean;
  chartType?: "candles" | "bars" | "line";
};

export default function MiniChart({ candles, height = 200, dark = true, chartType = "candles" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

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

    // EMA overlays — only points where value is present
    const emaConfigs = [
      { key: "ema_20"  as const, color: "#f4f7fb", title: "EMA20" },
      { key: "ema_50"  as const, color: "#9ca3af", title: "EMA50" },
      { key: "ema_200" as const, color: "#6b7280", title: "EMA200" },
    ];

    for (const cfg of emaConfigs) {
      const pts = candles
        .filter(c => c[cfg.key] != null)
        .map(c => ({ time: c.time as import("lightweight-charts").Time, value: c[cfg.key] as number }));
      if (pts.length < 2) continue;
      const line = chart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(pts);
    }

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
  }, [candles, height, dark, chartType]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
