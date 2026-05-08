import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { CandleBar } from "@/lib/api";

export type Candle = CandleBar;

export type SeriesData =
  | { time: string; value: number; color?: string }
  | { time: string; open: number; high: number; low: number; close: number };

export type SeriesHandle =
  | ISeriesApi<"Line">
  | ISeriesApi<"Histogram">
  | ISeriesApi<"Candlestick">
  | ISeriesApi<"Bar">;

export type IndicatorStyle = {
  color?: string;
  lineWidth?: 1 | 2 | 3 | 4;
};

export interface IndicatorDef<P> {
  type: string;
  label: string;
  pane: "price" | "below";
  defaultParams: P;
  compute: (candles: Candle[], params: P) => SeriesData[];
  render: (
    chart: IChartApi,
    paneApi: unknown,
    data: SeriesData[],
    style: IndicatorStyle
  ) => SeriesHandle;
}

export type ChartIndicator = {
  type: "ema" | "sma" | "vwap" | "rsi" | "macd" | "volume" | "bollinger";
  params?: Record<string, unknown>;
};

export type DrawingPoint = { time: string; price: number };

export type WorkspaceDrawing =
  | { id: string; kind: "trendline"; p1: DrawingPoint; p2: DrawingPoint; color: string; width: number }
  | { id: string; kind: "hline"; price: number; color: string; width: number; label?: string }
  | { id: string; tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe?: string; created_at?: string };

export type ChartWorkspace = {
  symbol: string;
  timeframe: string;
  indicators: ChartIndicator[];
  drawings: WorkspaceDrawing[];
};

export function toChartTime(time: string): Time {
  return time as Time;
}
