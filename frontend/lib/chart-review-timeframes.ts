import type { CandleBar } from "@/lib/api";

type ReviewCandle = Pick<CandleBar, "time" | "open" | "high" | "low" | "close" | "volume">;

export type HigherTimeframeTrend = {
  label: "Weekly" | "Monthly";
  status: "uptrend" | "constructive" | "range" | "downtrend" | "limited";
  close: number | null;
  changePct: number | null;
  average: number | null;
  bars: number;
  summary: string;
  detail: string;
};

export type HigherTimeframeReview = {
  weekly: HigherTimeframeTrend;
  monthly: HigherTimeframeTrend;
  alignment: "aligned" | "mixed" | "weak" | "limited";
  playbookStatus: "ready" | "watch" | "missing";
  playbookDetail: string;
};

type AggregatedCandle = ReviewCandle & { bucket: string };

function validCandles(candles: ReviewCandle[]) {
  return candles
    .filter((candle) => candle.time && Number.isFinite(candle.close))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function weekBucket(time: string) {
  const date = new Date(`${time}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return time.slice(0, 10);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function monthBucket(time: string) {
  return time.slice(0, 7);
}

function aggregate(candles: ReviewCandle[], bucketFor: (time: string) => string): AggregatedCandle[] {
  const buckets = new Map<string, AggregatedCandle>();

  for (const candle of validCandles(candles)) {
    const bucket = bucketFor(candle.time);
    const current = buckets.get(bucket);
    if (!current) {
      buckets.set(bucket, { ...candle, bucket });
      continue;
    }

    buckets.set(bucket, {
      bucket,
      time: candle.time,
      open: current.open,
      high: Math.max(current.high, candle.high),
      low: Math.min(current.low, candle.low),
      close: candle.close,
      volume: current.volume + candle.volume,
    });
  }

  return [...buckets.values()];
}

function averageClose(bars: AggregatedCandle[], period: number): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const sum = slice.reduce((total, candle) => total + candle.close, 0);
  return sum / slice.length;
}

function formatPct(value: number | null) {
  if (value == null) return "pending";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function summarize(
  label: "Weekly" | "Monthly",
  bars: AggregatedCandle[],
  lookback: number,
  averagePeriod: number,
  minimumBars: number,
): HigherTimeframeTrend {
  const latest = bars.at(-1) ?? null;
  const close = latest?.close ?? null;
  const average = averageClose(bars, averagePeriod);
  const compare = bars.length > lookback ? bars.at(-(lookback + 1)) : null;
  const changePct = close != null && compare?.close
    ? ((close - compare.close) / compare.close) * 100
    : null;

  if (!latest || bars.length < minimumBars || close == null || average == null || changePct == null) {
    return {
      label,
      status: "limited",
      close,
      changePct,
      average,
      bars: bars.length,
      summary: `${label} context limited`,
      detail: `${bars.length} ${label.toLowerCase()} bars loaded; need ${minimumBars}+ for launch-grade review.`,
    };
  }

  const aboveAverage = close >= average;
  const status: HigherTimeframeTrend["status"] = aboveAverage && changePct >= 5
    ? "uptrend"
    : aboveAverage && changePct >= 0
      ? "constructive"
      : !aboveAverage && changePct <= -5
        ? "downtrend"
        : "range";

  const averageLabel = label === "Weekly" ? `${averagePeriod}W` : `${averagePeriod}M`;
  return {
    label,
    status,
    close,
    changePct,
    average,
    bars: bars.length,
    summary: `${label} ${status} (${formatPct(changePct)})`,
    detail: `Close ${aboveAverage ? "above" : "below"} ${averageLabel} average across ${bars.length} bars.`,
  };
}

export function buildHigherTimeframeReview(candles: ReviewCandle[]): HigherTimeframeReview {
  const weekly = summarize("Weekly", aggregate(candles, weekBucket), 13, 10, 14);
  const monthly = summarize("Monthly", aggregate(candles, monthBucket), 6, 6, 7);
  const statuses = [weekly.status, monthly.status];

  const alignment: HigherTimeframeReview["alignment"] = statuses.includes("limited")
    ? "limited"
    : statuses.every((status) => status === "uptrend" || status === "constructive")
      ? "aligned"
      : statuses.every((status) => status === "downtrend")
        ? "weak"
        : "mixed";

  const playbookStatus: HigherTimeframeReview["playbookStatus"] = alignment === "aligned"
    ? "ready"
    : alignment === "limited"
      ? "missing"
      : "watch";

  return {
    weekly,
    monthly,
    alignment,
    playbookStatus,
    playbookDetail: alignment === "aligned"
      ? "Weekly/monthly aligned"
      : alignment === "limited"
        ? "Need more history"
        : `${weekly.status} / ${monthly.status}`,
  };
}
