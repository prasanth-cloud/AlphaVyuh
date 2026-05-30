import type { CandlesResponse, ScannerIdeaContext, WorkflowLifecycle, WorkflowStatePatch } from "@/lib/api";
import { buildHigherTimeframeReview } from "@/lib/chart-review-timeframes";
import {
  formatChartCoverageRange,
  formatChartGranularity,
  getCoverageAvailabilityMessage,
  getRangeAvailabilityMessage,
  type WatchlistChartRequest,
} from "@/lib/watchlist-chart-range";

export const MULTI_CHART_REVIEW_LIMIT = 4;

export type MultiChartReviewSource = "scanner" | "watchlist" | "manual";
export type MultiChartReviewDecision = Extract<WorkflowLifecycle, "ready" | "review_later" | "invalidated">;

export type MultiChartReviewHrefOptions = {
  source?: MultiChartReviewSource;
  watchlistId?: string | null;
  watchlistName?: string | null;
};

function normalizeSymbol(value: string): string | null {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/^NSE:/, "")
    .replace(/[^A-Z0-9&-]/g, "");
  return cleaned ? cleaned : null;
}

export function normalizeMultiChartSymbols(input: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[,\s]+/)
      : [];
  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const item of raw) {
    const symbol = normalizeSymbol(item);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
    if (symbols.length >= MULTI_CHART_REVIEW_LIMIT) break;
  }

  return symbols;
}

export function tradingViewNseSymbols(input: string[] | string | null | undefined): string {
  return normalizeMultiChartSymbols(input).map((symbol) => `NSE:${symbol}`).join(",");
}

export function buildMultiChartReviewHref(
  input: string[] | string | null | undefined,
  options: MultiChartReviewHrefOptions = {},
): string {
  const symbols = normalizeMultiChartSymbols(input);
  const params = new URLSearchParams();
  if (symbols.length) params.set("symbols", symbols.join(","));
  if (options.source) params.set("from", options.source);
  if (options.watchlistId) params.set("watchlistId", options.watchlistId);
  if (options.watchlistName) params.set("watchlist", options.watchlistName);
  return `/charts${params.toString() ? `?${params.toString()}` : ""}`;
}

export function buildMultiChartDecisionPatch(
  symbol: string,
  lifecycle: MultiChartReviewDecision,
  options: {
    source?: string | null;
    watchlistId?: string | null;
    existingTags?: string[] | null;
  } = {},
): WorkflowStatePatch {
  const normalized = normalizeSymbol(symbol) ?? symbol.trim().toUpperCase();
  const tags = new Set(options.existingTags ?? []);
  tags.add(`multi-chart-${lifecycle.replace("_", "-")}`);
  return {
    symbol: normalized,
    lifecycle,
    source: options.source ?? "chart",
    watchlist_id: options.watchlistId ?? null,
    tags: [...tags],
    ignored: lifecycle === "invalidated",
    review_later: lifecycle === "review_later",
  };
}

export type MultiChartAnalysisMetric = {
  label: string;
  value: string;
  tone: "good" | "warn" | "muted";
};

export type MultiChartAnalysisSummary = {
  playbookStatus: "ready" | "watch" | "missing";
  playbookDetail: string;
  reviewScore: {
    passed: number;
    total: number;
    label: string;
    tone: "good" | "warn" | "muted";
    blockers: string[];
  };
  metrics: MultiChartAnalysisMetric[];
  checklist: string[];
};

export type MultiChartTrustContext = {
  sourceLabel: string;
  asOf: string | null;
  coverageLabel: string;
  granularityLabel: string;
  availabilityMessage: string | null;
  contractLabel: string;
  contractTone: "good" | "warn" | "muted";
};

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRatio(value: number | null | undefined) {
  if (value == null) return "Pending";
  return `${value.toFixed(2)}x`;
}

function metric(label: string, value: string, tone: MultiChartAnalysisMetric["tone"] = "muted"): MultiChartAnalysisMetric {
  return { label, value, tone };
}

export function buildMultiChartTrustContext(
  data: CandlesResponse | null | undefined,
  request: Pick<WatchlistChartRequest, "label" | "timeframe" | "expectedMonths">,
): MultiChartTrustContext | null {
  if (!data) return null;

  const availabilityMessage =
    getCoverageAvailabilityMessage(data.coverage, request) ??
    (data.coverage ? null : getRangeAvailabilityMessage(data.candles, request));
  const sourceLabel = data.source_metadata?.source_name ?? data.coverage?.source_name ?? data.source ?? "Market data";
  const asOf = data.coverage?.as_of ?? data.source_metadata?.as_of ?? data.coverage?.available_to ?? data.candles.at(-1)?.time ?? null;
  const isFiveYearDaily = request.label === "5Y" && request.timeframe === "D";
  const contractTone = isFiveYearDaily
    ? availabilityMessage ? "warn" : "good"
    : "muted";
  const contractLabel = isFiveYearDaily
    ? availabilityMessage ? "5Y daily history limited" : "5Y daily contract ready"
    : "5Y launch contract not selected";

  return {
    sourceLabel,
    asOf,
    coverageLabel: formatChartCoverageRange(data.coverage, data.candles),
    granularityLabel: `${formatChartGranularity(request.timeframe)} candles`,
    availabilityMessage,
    contractLabel,
    contractTone,
  };
}

function buildReviewScore(checks: { pass: boolean; blocker: string | null }[]): MultiChartAnalysisSummary["reviewScore"] {
  const passed = checks.filter((check) => check.pass).length;
  const total = checks.length;
  const blockers = checks.map((check) => check.pass ? null : check.blocker).filter(Boolean) as string[];
  const tone = passed >= 5 ? "good" : passed >= 3 ? "warn" : "muted";
  return {
    passed,
    total,
    label: `${passed}/${total} checks`,
    tone,
    blockers,
  };
}

export function buildMultiChartAnalysisSummary(
  data: CandlesResponse | null | undefined,
  scannerContext?: ScannerIdeaContext | null,
): MultiChartAnalysisSummary | null {
  if (!data || data.candles.length === 0) return null;

  const latest = data.latest;
  const higherTimeframe = buildHigherTimeframeReview(data.candles);
  const close = latest?.close ?? data.candles.at(-1)?.close ?? null;
  const ema20 = latest?.ema_20 ?? data.candles.at(-1)?.ema_20 ?? null;
  const ema50 = latest?.ema_50 ?? data.candles.at(-1)?.ema_50 ?? null;
  const ema200 = latest?.ema_200 ?? data.candles.at(-1)?.ema_200 ?? null;
  const week52High = latest?.week_52_high ?? null;
  const week52Distance = close != null && week52High
    ? ((week52High - close) / close) * 100
    : scannerContext?.week_52_high_pct ?? null;
  const movingAverageCount = [ema20, ema50, ema200].filter((ema) => close != null && ema != null && close >= ema).length;
  const movingAverageLabel = close == null || [ema20, ema50, ema200].every((ema) => ema == null)
    ? "Pending"
    : `${movingAverageCount}/3 above`;
  const rsScore = scannerContext?.rs_score ?? null;
  const volumeRatio = latest?.volume_ratio ?? scannerContext?.volume_ratio ?? null;
  const rsi14 = latest?.rsi_14 ?? scannerContext?.rsi_14 ?? null;
  const reviewScore = buildReviewScore([
    {
      pass: higherTimeframe.playbookStatus === "ready",
      blocker: higherTimeframe.playbookStatus === "ready" ? null : `W/M ${higherTimeframe.playbookDetail.toLowerCase()}`,
    },
    {
      pass: rsScore != null && rsScore >= 70,
      blocker: rsScore == null ? "RS pending" : `RS ${Math.round(rsScore)}`,
    },
    {
      pass: week52Distance != null && week52Distance <= 12,
      blocker: week52Distance == null ? "52W pending" : `52W ${week52Distance.toFixed(1)}% away`,
    },
    {
      pass: movingAverageCount === 3,
      blocker: movingAverageCount === 3 ? null : `MA ${movingAverageLabel}`,
    },
    {
      pass: volumeRatio != null && volumeRatio >= 1.5,
      blocker: volumeRatio == null ? "Volume pending" : `Volume ${formatRatio(volumeRatio)}`,
    },
    {
      pass: rsi14 != null && rsi14 >= 45 && rsi14 <= 75,
      blocker: rsi14 == null ? "RSI pending" : `RSI ${rsi14.toFixed(1)}`,
    },
  ]);

  return {
    playbookStatus: higherTimeframe.playbookStatus,
    playbookDetail: higherTimeframe.playbookDetail,
    reviewScore,
    metrics: [
      metric("W/M", higherTimeframe.playbookDetail, higherTimeframe.playbookStatus === "ready" ? "good" : higherTimeframe.playbookStatus === "watch" ? "warn" : "muted"),
      metric("RS", rsScore == null ? "Pending" : String(Math.round(rsScore)), rsScore == null ? "muted" : rsScore >= 70 ? "good" : "warn"),
      metric("52W", week52Distance == null ? "Pending" : `${week52Distance.toFixed(1)}% away`, week52Distance == null ? "muted" : week52Distance <= 12 ? "good" : "warn"),
      metric("MA", movingAverageLabel, movingAverageCount === 3 ? "good" : movingAverageCount > 0 ? "warn" : "muted"),
      metric("Volume", formatRatio(volumeRatio), (volumeRatio ?? 0) >= 1.5 ? "good" : "muted"),
      metric("RSI", rsi14 == null ? "Pending" : rsi14.toFixed(1), rsi14 == null ? "muted" : rsi14 >= 45 && rsi14 <= 75 ? "good" : "warn"),
    ],
    checklist: [
      `Review score: ${reviewScore.label}`,
      `Weekly/monthly: ${higherTimeframe.weekly.summary}; ${higherTimeframe.monthly.summary}`,
      `Moving averages: ${movingAverageLabel}`,
      week52Distance == null ? "52-week level: pending" : `52-week level: ${formatPct(-week52Distance)} from high`,
      rsScore == null ? "RS score: pending scanner context" : `RS score: ${Math.round(rsScore)}`,
      volumeRatio == null ? "Volume: pending" : `Volume: ${formatRatio(volumeRatio)}`,
    ],
  };
}
