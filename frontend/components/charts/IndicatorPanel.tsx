"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type Time,
  type LogicalRange,
} from "lightweight-charts";

type LinePoint = { time: string; value: number };
type MACDPoint = { time: string; macd: number | null; signal: number | null; histogram: number | null };
type StochPoint = { time: string; k: number; d: number | null };

type RSIProps = {
  type: "rsi";
  data: LinePoint[];
  height: number;
  logicalRange?: LogicalRange | null;
  onRangeChange?: (range: LogicalRange | null) => void;
};

type MACDProps = {
  type: "macd";
  data: MACDPoint[];
  height: number;
  logicalRange?: LogicalRange | null;
  onRangeChange?: (range: LogicalRange | null) => void;
};

type StochProps = {
  type: "stoch";
  data: StochPoint[];
  height: number;
  logicalRange?: LogicalRange | null;
  onRangeChange?: (range: LogicalRange | null) => void;
};

type Props = RSIProps | MACDProps | StochProps;

export default function IndicatorPanel(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#888888",
        fontFamily: "DM Sans, system-ui, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#f0f0ee", style: 1 },
        horzLines: { color: "#f0f0ee", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#aaaaaa", width: 1, style: 3 },
        horzLine: { color: "#aaaaaa", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "#e2e2df",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#e2e2df",
        timeVisible: false,
        visible: false,
      },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height: props.height,
    });

    chartRef.current = chart;

    if (props.type === "rsi") {
      const rsiLine = chart.addSeries(LineSeries, {
        color: "#5b63f5",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      // Overbought / oversold reference lines via price lines on the series
      rsiLine.createPriceLine({ price: 70, color: "#e5383b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      rsiLine.createPriceLine({ price: 30, color: "#26a65b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });

      if ((props as RSIProps).data.length) {
        rsiLine.setData(
          (props as RSIProps).data.map(p => ({ time: p.time as Time, value: p.value }))
        );
      }
    } else if (props.type === "stoch") {
      const stochData = (props as StochProps).data;

      const kLine = chart.addSeries(LineSeries, {
        color: "#26a65b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      });
      const dLine = chart.addSeries(LineSeries, {
        color: "#e5383b", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
      });

      kLine.createPriceLine({ price: 80, color: "#e5383b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      kLine.createPriceLine({ price: 20, color: "#26a65b", lineWidth: 1, lineStyle: 2, axisLabelVisible: false });

      if (stochData.length) {
        kLine.setData(stochData.map(p => ({ time: p.time as Time, value: p.k })));
        dLine.setData(
          stochData.filter(p => p.d != null).map(p => ({ time: p.time as Time, value: p.d! }))
        );
      }
    } else {
      const macdData = (props as MACDProps).data;

      const histogram = chart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const macdLine = chart.addSeries(LineSeries, {
        color: "#5b63f5", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      });
      const signalLine = chart.addSeries(LineSeries, {
        color: "#d97706", lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      });

      if (macdData.length) {
        histogram.setData(
          macdData
            .filter(p => p.histogram != null)
            .map(p => ({
              time: p.time as Time,
              value: p.histogram!,
              color: p.histogram! >= 0 ? "#26a65b55" : "#e5383b55",
            }))
        );
        macdLine.setData(
          macdData.filter(p => p.macd != null).map(p => ({ time: p.time as Time, value: p.macd! }))
        );
        signalLine.setData(
          macdData.filter(p => p.signal != null).map(p => ({ time: p.time as Time, value: p.signal! }))
        );
      }
    }

    // Range change handler
    if (props.onRangeChange) {
      const handler = (range: LogicalRange | null) => {
        if (!syncingRef.current) props.onRangeChange?.(range);
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    }

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.type, props.height]);

  // Sync incoming range changes from main chart
  useEffect(() => {
    if (!chartRef.current || props.logicalRange == null) return;
    syncingRef.current = true;
    chartRef.current.timeScale().setVisibleLogicalRange(props.logicalRange);
    syncingRef.current = false;
  }, [props.logicalRange]);

  const label = props.type === "rsi" ? "RSI 14" : props.type === "stoch" ? "Stoch 14,3,3" : "MACD 12,26,9";

  return (
    <div className="relative w-full border-t border-[#f0f0ee]" style={{ height: props.height }}>
      <span className="absolute top-1.5 left-2 text-[10px] font-semibold text-[#aaa] z-10 pointer-events-none">
        {label}
      </span>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
