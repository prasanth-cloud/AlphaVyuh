import type { ScannerIdeaContext, WorkflowStatePatch } from "@/lib/api";

export type ScannerWorkflowMark = "shortlist" | "ignored" | "review_later";

type ScannerResultContext = {
  symbol: string;
  match_reasons?: string[];
  confidence_reasons?: string[];
  data_warnings?: string[];
  setup_score?: number | null;
  setup_grade?: string | null;
  confidence_label?: string | null;
};

type ScannerContextOptions = {
  presetId?: string | null;
  presetName?: string | null;
  tradeDate?: string | null;
  dataSource?: string | null;
  dataMode?: string | null;
  dataAsOf?: string | null;
};

export function scannerIdeaContext(
  result: ScannerResultContext,
  options: ScannerContextOptions = {}
): ScannerIdeaContext {
  return {
    source: "scanner",
    preset_id: options.presetId ?? null,
    preset_name: options.presetName ?? null,
    match_reasons: result.match_reasons ?? [],
    confidence_reasons: result.confidence_reasons ?? [],
    data_warnings: result.data_warnings ?? [],
    setup_score: result.setup_score ?? null,
    setup_grade: result.setup_grade ?? null,
    confidence_label: result.confidence_label ?? null,
    scan_trade_date: options.tradeDate ?? null,
    data_source: options.dataSource ?? null,
    data_mode: options.dataMode ?? null,
    data_as_of: options.dataAsOf ?? options.tradeDate ?? null,
    captured_at: new Date().toISOString(),
  };
}

export function scannerWorkflowPatch(
  symbol: string,
  mark: ScannerWorkflowMark,
  watchlistId?: string,
  result?: ScannerResultContext,
  contextOptions?: ScannerContextOptions
): WorkflowStatePatch {
  const lifecycle = mark === "shortlist" ? "idea" : mark;
  return {
    symbol: symbol.toUpperCase(),
    lifecycle,
    source: "scanner",
    ...(result ? { scanner_context: scannerIdeaContext(result, contextOptions) } : {}),
    ...(result?.setup_score != null ? { setup_quality: Math.max(1, Math.min(5, Math.round(result.setup_score / 20))) } : {}),
    ...(result?.confidence_label ? { notes: `Scanner: ${result.confidence_label}` } : {}),
    ...(result?.setup_grade ? { tags: [`setup-${result.setup_grade.toLowerCase()}`] } : {}),
    ...(watchlistId ? { watchlist_id: watchlistId } : {}),
    ...(mark === "ignored" ? { ignored: true, review_later: false } : {}),
    ...(mark === "review_later" ? { review_later: true, ignored: false } : {}),
  };
}

export function scannerWatchlistPatch(
  resultOrSymbol: ScannerResultContext | string,
  watchlistId: string,
  contextOptions?: ScannerContextOptions
): WorkflowStatePatch {
  const symbol = typeof resultOrSymbol === "string" ? resultOrSymbol : resultOrSymbol.symbol;
  const result = typeof resultOrSymbol === "string" ? undefined : resultOrSymbol;
  return {
    symbol: symbol.toUpperCase(),
    watchlist_id: watchlistId,
    lifecycle: "watch",
    source: "scanner",
    ignored: false,
    review_later: false,
    ...(result ? { scanner_context: scannerIdeaContext(result, contextOptions) } : {}),
    ...(result?.setup_score != null ? { setup_quality: Math.max(1, Math.min(5, Math.round(result.setup_score / 20))) } : {}),
    ...(result?.confidence_label ? { notes: `Scanner: ${result.confidence_label}` } : {}),
    ...(result?.setup_grade ? { tags: [`setup-${result.setup_grade.toLowerCase()}`] } : {}),
  };
}

export function scannerWatchlistPatches(
  symbolsOrResults: Array<ScannerResultContext | string>,
  watchlistId: string,
  contextOptions?: ScannerContextOptions
): WorkflowStatePatch[] {
  return symbolsOrResults.map((item) => scannerWatchlistPatch(item, watchlistId, contextOptions));
}

export function selectedScannerSymbols<T extends { symbol: string }>(results: T[], selected: Set<string>): string[] {
  return results.filter((result) => selected.has(result.symbol)).map((result) => result.symbol);
}
