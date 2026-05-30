import type { WorkflowLifecycle, WorkflowStatePatch } from "@/lib/api";

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
