import type { CandlesResponse, ScannerIdeaContext, WorkflowLifecycle, WorkflowStatePatch } from "@/lib/api";
import { buildHigherTimeframeReview } from "@/lib/chart-review-timeframes";
import { scannerReviewContextSummary } from "@/lib/scanner-review-context";
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
export type MultiChartReviewLayout = "2-up" | "4-up";

export type MultiChartReviewHrefOptions = {
  source?: MultiChartReviewSource;
  watchlistId?: string | null;
  watchlistName?: string | null;
  layout?: MultiChartReviewLayout | null;
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

export function normalizeMultiChartLayout(input: string | null | undefined): MultiChartReviewLayout {
  return input === "2-up" ? "2-up" : "4-up";
}

export function getMultiChartGridTemplateColumns(layout: MultiChartReviewLayout): string {
  return layout === "2-up"
    ? "repeat(auto-fit, minmax(420px, 1fr))"
    : "repeat(auto-fit, minmax(280px, 1fr))";
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
  if (options.layout) params.set("layout", options.layout);
  return `/charts${params.toString() ? `?${params.toString()}` : ""}`;
}

export function buildMultiChartDecisionPatch(
  symbol: string,
  lifecycle: MultiChartReviewDecision,
  options: {
    source?: string | null;
    watchlistId?: string | null;
    existingTags?: string[] | null;
    existingNotes?: string | null;
    analysis?: MultiChartAnalysisSummary | null;
    trust?: MultiChartTrustContext | null;
    alertDraft?: MultiChartAlertDraft | null;
    scannerContext?: ScannerIdeaContext | null;
    rangeLabel?: string | null;
  } = {},
): WorkflowStatePatch {
  const normalized = normalizeSymbol(symbol) ?? symbol.trim().toUpperCase();
  const tags = new Set(options.existingTags ?? []);
  tags.add(`multi-chart-${lifecycle.replace("_", "-")}`);
  const notes = buildMultiChartDecisionNote(lifecycle, options);
  return {
    symbol: normalized,
    lifecycle,
    source: options.source ?? "chart",
    watchlist_id: options.watchlistId ?? null,
    tags: [...tags],
    ...(options.scannerContext ? { scanner_context: options.scannerContext } : {}),
    ...(notes == null ? {} : { notes }),
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

export type MultiChartAlertDraft = {
  triggerLabel: string;
  triggerPrice: number;
  invalidationLabel: string;
  invalidationPrice: number;
  detail: string;
  tone: "good" | "warn" | "muted";
};

export type MultiChartBoardSummaryItem = {
  symbol: string;
  lifecycle?: WorkflowLifecycle | null;
  analysis?: MultiChartAnalysisSummary | null;
  trust?: MultiChartTrustContext | null;
  alertDraft?: MultiChartAlertDraft | null;
  scannerContext?: ScannerIdeaContext | null;
};

export type MultiChartBoardPulse = {
  loadedCount: number;
  readyCount: number;
  watchCount: number;
  missingCount: number;
  averageScoreLabel: string;
  topCandidate: {
    symbol: string;
    scoreLabel: string;
    detail: string;
  } | null;
  topBlocker: string;
  tone: "good" | "warn" | "muted";
};

const BOARD_REVIEW_NOTE_PREFIX = "[Multi-chart review]";

function decisionLabel(lifecycle: MultiChartReviewDecision): string {
  if (lifecycle === "ready") return "Ready";
  if (lifecycle === "review_later") return "Later";
  return "Invalidated";
}

function mergeBoardReviewNote(existingNotes: string | null | undefined, nextNote: string): string {
  const kept = (existingNotes ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(BOARD_REVIEW_NOTE_PREFIX));
  return [...kept, nextNote].join("\n");
}

export function buildMultiChartDecisionNote(
  lifecycle: MultiChartReviewDecision,
  options: {
    existingNotes?: string | null;
    analysis?: MultiChartAnalysisSummary | null;
    trust?: MultiChartTrustContext | null;
    alertDraft?: MultiChartAlertDraft | null;
    scannerContext?: ScannerIdeaContext | null;
    rangeLabel?: string | null;
  } = {},
): string {
  const parts = [
    `${BOARD_REVIEW_NOTE_PREFIX} ${decisionLabel(lifecycle)}`,
    options.rangeLabel ? `${options.rangeLabel} board` : "review board",
  ];

  if (options.analysis) {
    parts.push(options.analysis.reviewScore.label);
    parts.push(options.analysis.playbookDetail);
    const blockers = options.analysis.reviewScore.blockers.slice(0, 3);
    if (blockers.length) parts.push(`Needs ${blockers.join(", ")}`);
  }

  if (options.scannerContext) {
    const scannerSummary = scannerReviewContextSummary(options.scannerContext);
    const preset = scannerSummary.pills[0] ?? null;
    parts.push(`Original scan${preset ? ` ${preset}` : ""}`);
    if (scannerSummary.primaryReason) parts.push(scannerSummary.primaryReason);
  }

  if (options.trust) {
    parts.push(options.trust.contractLabel);
    parts.push(`Source ${formatMarketDataSourceLabel(options.trust.sourceLabel)}${options.trust.asOf ? ` as of ${options.trust.asOf}` : ""}`);
  }

  if (options.alertDraft) {
    parts.push(`Alert ${options.alertDraft.triggerLabel} ${formatPrice(options.alertDraft.triggerPrice)}`);
    parts.push(`Invalidation ${formatPrice(options.alertDraft.invalidationPrice)}`);
  }

  return mergeBoardReviewNote(options.existingNotes, `${parts.join(" · ")}.`);
}

function formatMarketDataSourceLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function formatPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPrice(value: number) {
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function boardLifecycleLabel(lifecycle: WorkflowLifecycle | null | undefined): string {
  if (lifecycle === "ready") return "Ready";
  if (lifecycle === "review_later") return "Later";
  if (lifecycle === "invalidated") return "Invalidated";
  if (lifecycle === "idea") return "Idea";
  if (lifecycle === "watch") return "Watch";
  if (lifecycle === "triggered") return "Triggered";
  if (lifecycle === "open") return "Open";
  if (lifecycle === "closed") return "Closed";
  if (lifecycle === "reviewed") return "Reviewed";
  if (lifecycle === "ignored") return "Ignored";
  return "Undecided";
}

export function buildMultiChartBoardSummary(
  items: MultiChartBoardSummaryItem[],
  options: {
    rangeLabel?: string | null;
    sourceLabel?: string | null;
  } = {},
): string {
  const lines = [
    `AlphaVyuh review board${options.rangeLabel ? ` · ${options.rangeLabel}` : ""}${options.sourceLabel ? ` · ${options.sourceLabel}` : ""}`,
  ];

  for (const item of items) {
    const symbol = normalizeSymbol(item.symbol) ?? item.symbol.trim().toUpperCase();
    if (!symbol) continue;

    const parts = [boardLifecycleLabel(item.lifecycle)];

    if (item.analysis) {
      parts.push(item.analysis.reviewScore.label);
      parts.push(item.analysis.playbookDetail);
      const blockers = item.analysis.reviewScore.blockers.slice(0, 3);
      if (blockers.length) parts.push(`Needs ${blockers.join(", ")}`);
      const rs = item.analysis.metrics.find((metricItem) => metricItem.label === "RS")?.value;
      const week52 = item.analysis.metrics.find((metricItem) => metricItem.label === "52W")?.value;
      const volume = item.analysis.metrics.find((metricItem) => metricItem.label === "Volume")?.value;
      if (rs) parts.push(`RS ${rs}`);
      if (week52) parts.push(`52W ${week52}`);
      if (volume) parts.push(`Volume ${volume}`);
    } else {
      parts.push("Analysis pending");
    }

    if (item.trust) {
      parts.push(item.trust.contractLabel);
      parts.push(`Source ${formatMarketDataSourceLabel(item.trust.sourceLabel)}${item.trust.asOf ? ` as of ${item.trust.asOf}` : ""}`);
      if (item.trust.availabilityMessage) parts.push(item.trust.availabilityMessage);
    }

    if (item.alertDraft) {
      parts.push(`Alert ${item.alertDraft.triggerLabel} ${formatPrice(item.alertDraft.triggerPrice)}`);
      parts.push(`Invalidation ${formatPrice(item.alertDraft.invalidationPrice)}`);
    }

    if (item.scannerContext) {
      const scannerSummary = scannerReviewContextSummary(item.scannerContext);
      const preset = scannerSummary.pills[0] ?? null;
      if (preset) parts.push(`Original scan ${preset}`);
      if (scannerSummary.primaryReason) parts.push(scannerSummary.primaryReason);
      if (scannerSummary.warnings.length) parts.push(`Warnings ${scannerSummary.warnings.slice(0, 2).join("; ")}`);
    }

    lines.push(`${symbol}: ${parts.join(" · ")}.`);
  }

  return lines.join("\n");
}

function analysisScore(analysis: MultiChartAnalysisSummary): number {
  return analysis.reviewScore.total > 0
    ? analysis.reviewScore.passed / analysis.reviewScore.total
    : 0;
}

export function buildMultiChartBoardPulse(items: MultiChartBoardSummaryItem[]): MultiChartBoardPulse {
  const loadedItems = items.filter((item) => item.analysis);
  const loadedCount = loadedItems.length;
  const readyCount = loadedItems.filter((item) => item.analysis?.playbookStatus === "ready").length;
  const watchCount = loadedItems.filter((item) => item.analysis?.playbookStatus === "watch").length;
  const missingCount = Math.max(0, items.length - loadedCount) +
    loadedItems.filter((item) => item.analysis?.playbookStatus === "missing").length;
  const totalChecks = loadedItems.reduce((sum, item) => sum + (item.analysis?.reviewScore.total ?? 0), 0);
  const passedChecks = loadedItems.reduce((sum, item) => sum + (item.analysis?.reviewScore.passed ?? 0), 0);
  const averageScoreLabel = totalChecks > 0
    ? `${Math.round((passedChecks / totalChecks) * 100)}% avg`
    : "Waiting for charts";

  const ranked = loadedItems
    .map((item) => ({
      item,
      symbol: normalizeSymbol(item.symbol) ?? item.symbol.trim().toUpperCase(),
      score: item.analysis ? analysisScore(item.analysis) : 0,
      passed: item.analysis?.reviewScore.passed ?? 0,
    }))
    .filter((entry) => entry.symbol)
    .sort((a, b) => b.score - a.score || b.passed - a.passed || a.symbol.localeCompare(b.symbol));

  const topCandidate = ranked[0]?.item.analysis
    ? {
        symbol: ranked[0].symbol,
        scoreLabel: ranked[0].item.analysis.reviewScore.label,
        detail: ranked[0].item.analysis.playbookDetail,
      }
    : null;

  const blockerCounts = new Map<string, number>();
  for (const item of loadedItems) {
    for (const blocker of item.analysis?.reviewScore.blockers ?? []) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
  }
  const topBlockerEntry = [...blockerCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const topBlocker = topBlockerEntry
    ? topBlockerEntry[1] > 1 ? `${topBlockerEntry[0]} (${topBlockerEntry[1]} symbols)` : topBlockerEntry[0]
    : loadedCount > 0 ? "No shared blocker" : "Charts loading";
  const tone = loadedCount === 0
    ? "muted"
    : readyCount > 0 && topCandidate?.scoreLabel.startsWith("6/")
      ? "good"
      : watchCount > 0 || readyCount > 0
        ? "warn"
        : "muted";

  return {
    loadedCount,
    readyCount,
    watchCount,
    missingCount,
    averageScoreLabel,
    topCandidate,
    topBlocker,
    tone,
  };
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

export function buildMultiChartAlertDraft(
  data: CandlesResponse | null | undefined,
  analysis?: MultiChartAnalysisSummary | null,
): MultiChartAlertDraft | null {
  const latest = data?.latest;
  const close = latest?.close ?? data?.candles.at(-1)?.close ?? null;
  if (!close) return null;

  const week52High = latest?.week_52_high ?? null;
  const atr = latest?.atr_14 ?? null;
  const ema50 = latest?.ema_50 ?? data?.candles.at(-1)?.ema_50 ?? null;
  const week52Distance = week52High ? ((week52High - close) / close) * 100 : null;
  const nearBreakout = week52High != null && week52High >= close && (week52Distance ?? 100) <= 12;
  const triggerPrice = nearBreakout
    ? week52High * 1.002
    : atr
      ? close + atr * 0.5
      : close * 1.02;
  const invalidationPrice = ema50 && ema50 < close
    ? ema50
    : atr
      ? close - atr * 1.5
      : close * 0.95;
  const triggerLabel = nearBreakout ? "52W breakout" : "follow-through";
  const invalidationLabel = ema50 && ema50 < close ? "50 EMA" : "ATR support";
  const tone = analysis?.reviewScore.tone ?? (nearBreakout ? "good" : "muted");

  return {
    triggerLabel,
    triggerPrice,
    invalidationLabel,
    invalidationPrice,
    detail: `${triggerLabel} alert above ${formatPrice(triggerPrice)}; review if price loses ${invalidationLabel} near ${formatPrice(invalidationPrice)}.`,
    tone,
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
