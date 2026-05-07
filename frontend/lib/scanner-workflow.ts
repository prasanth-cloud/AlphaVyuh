import type { WorkflowStatePatch } from "@/lib/api";

export type ScannerWorkflowMark = "shortlist" | "ignored" | "review_later";

export function scannerWorkflowPatch(
  symbol: string,
  mark: ScannerWorkflowMark,
  watchlistId?: string
): WorkflowStatePatch {
  const lifecycle = mark === "shortlist" ? "idea" : mark;
  return {
    symbol: symbol.toUpperCase(),
    lifecycle,
    source: "scanner",
    ...(watchlistId ? { watchlist_id: watchlistId } : {}),
    ...(mark === "ignored" ? { ignored: true, review_later: false } : {}),
    ...(mark === "review_later" ? { review_later: true, ignored: false } : {}),
  };
}

export function scannerWatchlistPatches(symbols: string[], watchlistId: string): WorkflowStatePatch[] {
  return symbols.map((symbol) => ({
    symbol: symbol.toUpperCase(),
    watchlist_id: watchlistId,
    lifecycle: "watch",
    source: "scanner",
    ignored: false,
    review_later: false,
  }));
}

export function selectedScannerSymbols<T extends { symbol: string }>(results: T[], selected: Set<string>): string[] {
  return results.filter((result) => selected.has(result.symbol)).map((result) => result.symbol);
}
