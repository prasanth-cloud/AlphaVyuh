import type {
  ChartSnapshotDrawingV1,
  ChartSnapshotStateV1,
  DataMode,
  JournalChartSnapshot,
  ScannerIdeaContext,
} from "@/lib/api/types";

type SnapshotInput = Omit<ChartSnapshotStateV1, "schema_version" | "symbol" | "captured_at"> & {
  symbol: string;
  captured_at?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDataMode(value: unknown): DataMode {
  return value === "live" || value === "eod" || value === "fallback" || value === "demo" || value === "unknown"
    ? value
    : "unknown";
}

function clonePoint(point: ChartSnapshotDrawingV1["p1"]): ChartSnapshotDrawingV1["p1"] {
  return { time: point.time, price: point.price };
}

function cloneDrawing(drawing: ChartSnapshotDrawingV1): ChartSnapshotDrawingV1 {
  return {
    id: drawing.id,
    tool: drawing.tool,
    p1: clonePoint(drawing.p1),
    p2: clonePoint(drawing.p2),
    p3: drawing.p3 ? clonePoint(drawing.p3) : undefined,
    color: drawing.color,
    text: drawing.text,
    locked: drawing.locked,
    hidden: drawing.hidden,
  };
}

function normalizePoint(value: unknown): ChartSnapshotDrawingV1["p1"] | null {
  if (!isRecord(value)) return null;
  const time = cleanString(value.time);
  const price = finiteNumber(value.price);
  return time && price != null ? { time, price } : null;
}

function normalizeDrawing(value: unknown): ChartSnapshotDrawingV1 | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id);
  const tool = cleanString(value.tool);
  const p1 = normalizePoint(value.p1);
  const p2 = normalizePoint(value.p2);
  const p3 = value.p3 == null ? undefined : normalizePoint(value.p3) ?? undefined;
  if (!id || !tool || !p1 || !p2) return null;
  return {
    id,
    tool,
    p1,
    p2,
    p3,
    color: cleanString(value.color) ?? "#f4f7fb",
    text: cleanString(value.text) ?? undefined,
    locked: value.locked === true,
    hidden: value.hidden === true,
  };
}

export function cloneChartSnapshotState(state: ChartSnapshotStateV1): ChartSnapshotStateV1 {
  return {
    ...state,
    visible_range: state.visible_range ? { ...state.visible_range } : null,
    indicators: [...state.indicators],
    drawings: state.drawings.map(cloneDrawing),
  };
}

export function buildChartSnapshotState(input: SnapshotInput): ChartSnapshotStateV1 {
  return cloneChartSnapshotState({
    ...input,
    schema_version: 1,
    symbol: input.symbol.trim().toUpperCase(),
    captured_at: input.captured_at ?? new Date().toISOString(),
  });
}

export function normalizeJournalChartSnapshot(value: unknown): JournalChartSnapshot {
  if (!isRecord(value) || value.available !== true || !isRecord(value.state)) {
    return { available: false, state: null, storage_path: null, captured_at: null };
  }
  const raw = value.state;
  const symbol = cleanString(raw.symbol);
  const timeframe = cleanString(raw.timeframe);
  const rangeLabel = cleanString(raw.range_label);
  const chartType = cleanString(raw.chart_type);
  const entryPrice = finiteNumber(raw.entry_price);
  const capturedAt = cleanString(raw.captured_at);
  if (raw.schema_version !== 1 || !symbol || !timeframe || !rangeLabel || !chartType || entryPrice == null || !capturedAt) {
    return { available: false, state: null, storage_path: null, captured_at: null };
  }
  const visible = isRecord(raw.visible_range)
    ? { from: finiteNumber(raw.visible_range.from), to: finiteNumber(raw.visible_range.to) }
    : null;
  const visibleRange = visible?.from != null && visible.to != null ? { from: visible.from, to: visible.to } : null;
  const state: ChartSnapshotStateV1 = {
    schema_version: 1,
    symbol: symbol.toUpperCase(),
    timeframe,
    range_label: rangeLabel,
    chart_type: chartType,
    visible_range: visibleRange,
    indicators: Array.isArray(raw.indicators)
      ? raw.indicators.map(cleanString).filter((item): item is string => Boolean(item)).slice(0, 32)
      : [],
    drawings: Array.isArray(raw.drawings)
      ? raw.drawings.map(normalizeDrawing).filter((item): item is ChartSnapshotDrawingV1 => Boolean(item)).slice(0, 250)
      : [],
    entry_price: entryPrice,
    last_bar_time: cleanString(raw.last_bar_time),
    data_source: cleanString(raw.data_source) ?? "Unknown source",
    data_mode: normalizeDataMode(raw.data_mode),
    data_as_of: cleanString(raw.data_as_of),
    captured_at: capturedAt,
  };
  return {
    available: true,
    state,
    storage_path: cleanString(value.storage_path),
    captured_at: cleanString(value.captured_at) ?? state.captured_at,
  };
}

export function buildChartSnapshotMetadata(
  symbol: string,
  entryPrice: number,
  timeframe = "D",
): NonNullable<ScannerIdeaContext["chart_snapshot"]> {
  const normalized = symbol.trim().toUpperCase();
  return {
    chart_url: `/charts/${normalized}?full=1`,
    symbol: normalized,
    timeframe,
    entry_price: entryPrice,
    captured_at: new Date().toISOString(),
  };
}
