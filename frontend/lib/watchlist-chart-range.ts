export type WatchlistChartTimeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "10Y";

export type WatchlistChartRequest = {
  label: WatchlistChartTimeframe;
  timeframe: "D" | "W" | "M";
  from_date: string;
  to_date: string;
  limit: number;
  expectedMonths: number;
};

const REQUESTS: Record<WatchlistChartTimeframe, { timeframe: "D" | "W" | "M"; days?: number; months?: number; limit: number; expectedMonths: number }> = {
  "1D": { timeframe: "D", days: 7, limit: 10, expectedMonths: 0.25 },
  "1W": { timeframe: "D", days: 14, limit: 15, expectedMonths: 0.5 },
  "1M": { timeframe: "D", months: 1, limit: 35, expectedMonths: 1 },
  "3M": { timeframe: "D", months: 3, limit: 80, expectedMonths: 3 },
  "6M": { timeframe: "D", months: 6, limit: 150, expectedMonths: 6 },
  "1Y": { timeframe: "D", months: 12, limit: 270, expectedMonths: 12 },
  "3Y": { timeframe: "W", months: 36, limit: 170, expectedMonths: 36 },
  "5Y": { timeframe: "W", months: 60, limit: 270, expectedMonths: 60 },
  "10Y": { timeframe: "M", months: 120, limit: 130, expectedMonths: 120 },
};

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
  const normalized = label in REQUESTS ? label as WatchlistChartTimeframe : "3M";
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
