export type IntradayChartTimeframe = "5m" | "15m" | "30m" | "1h";
export type EodChartTimeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y";
export type WatchlistChartTimeframe = IntradayChartTimeframe | EodChartTimeframe;

export const INTRADAY_UNAVAILABLE_MESSAGE = "Intraday data is not available on the EOD data plan yet.";

export const CHART_TIMEFRAME_OPTIONS: Array<{
  label: WatchlistChartTimeframe;
  group: "Intraday" | "Historical";
  disabled?: boolean;
  unavailableReason?: string;
}> = [
  { label: "5m", group: "Intraday", disabled: true, unavailableReason: INTRADAY_UNAVAILABLE_MESSAGE },
  { label: "15m", group: "Intraday", disabled: true, unavailableReason: INTRADAY_UNAVAILABLE_MESSAGE },
  { label: "30m", group: "Intraday", disabled: true, unavailableReason: INTRADAY_UNAVAILABLE_MESSAGE },
  { label: "1h", group: "Intraday", disabled: true, unavailableReason: INTRADAY_UNAVAILABLE_MESSAGE },
  { label: "1D", group: "Historical" },
  { label: "1W", group: "Historical" },
  { label: "1M", group: "Historical" },
  { label: "3M", group: "Historical" },
  { label: "6M", group: "Historical" },
  { label: "1Y", group: "Historical" },
  { label: "3Y", group: "Historical" },
  { label: "5Y", group: "Historical" },
  { label: "10Y", group: "Historical" },
];

export type WatchlistChartRequest = {
  label: WatchlistChartTimeframe;
  timeframe: "D" | "W" | "M";
  from_date: string;
  to_date: string;
  limit: number;
  expectedMonths: number;
};

const REQUESTS: Record<EodChartTimeframe, { timeframe: "D" | "W" | "M"; days?: number; months?: number; limit: number; expectedMonths: number }> = {
  "1D": { timeframe: "D", days: 7, limit: 10, expectedMonths: 0.25 },
  "1W": { timeframe: "D", days: 14, limit: 15, expectedMonths: 0.5 },
  "1M": { timeframe: "D", months: 1, limit: 35, expectedMonths: 1 },
  "3M": { timeframe: "D", months: 3, limit: 80, expectedMonths: 3 },
  "6M": { timeframe: "D", months: 6, limit: 150, expectedMonths: 6 },
  "1Y": { timeframe: "D", months: 12, limit: 270, expectedMonths: 12 },
  "3Y": { timeframe: "W", months: 36, limit: 170, expectedMonths: 36 },
  "5Y": { timeframe: "W", months: 60, limit: 280, expectedMonths: 60 },
  "10Y": { timeframe: "M", months: 120, limit: 130, expectedMonths: 120 },
};

export function isIntradayTimeframe(label: string): label is IntradayChartTimeframe {
  return label === "5m" || label === "15m" || label === "30m" || label === "1h";
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function subtractWindow(date: Date, config: { days?: number; months?: number }) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (config.days) next.setUTCDate(next.getUTCDate() - config.days);
  if (config.months) next.setUTCMonth(next.getUTCMonth() - config.months);
  return next;
}

export function getWatchlistChartRequest(label: string, now = new Date()): WatchlistChartRequest {
  const normalized = label in REQUESTS ? label as EodChartTimeframe : "3M";
  const config = REQUESTS[normalized];
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = subtractWindow(to, config);
  return {
    label: normalized,
    timeframe: config.timeframe,
    from_date: isoDate(from),
    to_date: isoDate(to),
    limit: config.limit,
    expectedMonths: config.expectedMonths,
  };
}

export function candleRangeMonths(candles: Array<{ time: string }>) {
  if (candles.length < 2) return 0;
  const first = new Date(`${candles[0].time}T00:00:00Z`).getTime();
  const last = new Date(`${candles[candles.length - 1].time}T00:00:00Z`).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return 0;
  return (last - first) / (1000 * 60 * 60 * 24 * 30.4375);
}

export function formatCandleRange(candles: Array<{ time: string }>) {
  if (!candles.length) return "No candles";
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  return first === last ? first : `${first} -> ${last}`;
}

type ChartCoverageLike = {
  available_from?: string | null;
  available_to?: string | null;
  returned_candles?: number | null;
  partial?: boolean;
  partial_reason?: string | null;
  coverage_pct?: number | null;
};

export function formatChartCoverageRange(
  coverage: ChartCoverageLike | null | undefined,
  candles: Array<{ time: string }>,
) {
  const first = coverage?.available_from ?? candles[0]?.time;
  const last = coverage?.available_to ?? candles[candles.length - 1]?.time;
  const count = coverage?.returned_candles ?? candles.length;
  if (!first || !last) return "No candles";
  const range = first === last ? first : `${first} -> ${last}`;
  return `${range} · ${count} bars`;
}

export function formatChartGranularity(timeframe: Pick<WatchlistChartRequest, "timeframe">["timeframe"]) {
  if (timeframe === "W") return "Weekly";
  if (timeframe === "M") return "Monthly";
  return "Daily";
}

export function getCoverageAvailabilityMessage(
  coverage: ChartCoverageLike | null | undefined,
  request: Pick<WatchlistChartRequest, "label">,
) {
  if (!coverage?.partial) return null;
  const percent = typeof coverage.coverage_pct === "number" && Number.isFinite(coverage.coverage_pct)
    ? ` (${coverage.coverage_pct.toFixed(0)}% coverage)`
    : "";
  if (coverage.partial_reason === "history_starts_after_requested_window") {
    return `History starts at ${coverage.available_from ?? "the first available candle"} for ${request.label}${percent}.`;
  }
  if (coverage.partial_reason === "history_ends_before_requested_window") {
    return `Latest candle is ${coverage.available_to ?? "not current"} for ${request.label}${percent}.`;
  }
  return `Partial chart history for ${request.label}${percent}.`;
}

export function getRangeAvailabilityMessage(
  candles: Array<{ time: string }>,
  request: Pick<WatchlistChartRequest, "label" | "expectedMonths">,
) {
  const months = candleRangeMonths(candles);
  if (!months || request.expectedMonths <= 1) return null;
  if (months >= request.expectedMonths * 0.75) return null;
  const label = months >= 12
    ? `${(months / 12).toFixed(1)} years`
    : `${Math.max(1, Math.round(months))} months`;
  return `Only ${label} available for ${request.label}.`;
}
