export const SCANNER_RUN_HISTORY_KEY = "alphavyuh-scanner-run-history-v1";
export const SCANNER_RUN_HISTORY_LIMIT = 8;
export const SCANNER_RUN_HISTORY_RESULT_LIMIT = 200;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ScannerRunHistoryResult = {
  symbol: string;
  company_name?: string | null;
  sector?: string | null;
};

export type ScannerRunHistoryEntry = {
  id: string;
  label: string;
  presetId: string | null;
  resultCount: number;
  totalMatches: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  sortBy: string;
  sortDesc: boolean;
  tradeDate: string;
  isLimited: boolean;
  dataSource: string | null;
  dataMode: string | null;
  dataAsOf: string | null;
  coveragePct: number | null;
  universeSize: number | null;
  elapsedMs: number | null;
  filters: Record<string, unknown> | null;
  topSymbols: string[];
  results: ScannerRunHistoryResult[];
  savedAt: number;
};

export type ScannerRunHistoryInput = Omit<ScannerRunHistoryEntry, "id" | "resultCount" | "topSymbols" | "results" | "savedAt"> & {
  results: ScannerRunHistoryResult[];
};

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanNullablePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function cleanBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cleanResults(value: unknown): ScannerRunHistoryResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> & { symbol: string } => !!item && typeof item === "object" && typeof item.symbol === "string")
    .slice(0, SCANNER_RUN_HISTORY_RESULT_LIMIT)
    .map((item) => ({ ...item, symbol: item.symbol.toUpperCase() }));
}

function cleanFilters(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...(value as Record<string, unknown>) };
}

function topSymbolsFor(results: ScannerRunHistoryResult[]): string[] {
  return results
    .map((result) => result.symbol)
    .filter((symbol, index, list) => symbol && list.indexOf(symbol) === index)
    .slice(0, 5);
}

function historyKey(entry: ScannerRunHistoryEntry): string {
  return [
    entry.label.toLowerCase(),
    entry.presetId ?? "custom",
    entry.tradeDate,
    entry.dataAsOf ?? "",
    entry.topSymbols.join(","),
  ].join("|");
}

export function createScannerRunHistoryEntry(input: ScannerRunHistoryInput, savedAt = Date.now()): ScannerRunHistoryEntry {
  const results = cleanResults(input.results);
  const label = cleanString(input.label, "Custom scan");
  const topSymbols = topSymbolsFor(results);
  return {
    id: `scanner-run-${savedAt}-${topSymbols[0] ?? "scan"}`,
    label,
    presetId: cleanNullableString(input.presetId),
    resultCount: results.length,
    totalMatches: Math.max(0, cleanNumber(input.totalMatches)),
    totalPages: Math.max(1, cleanNumber(input.totalPages, 1)),
    currentPage: Math.max(1, cleanNumber(input.currentPage, 1)),
    pageSize: Math.max(1, cleanNumber(input.pageSize, 25)),
    sortBy: cleanString(input.sortBy, "volume_ratio"),
    sortDesc: cleanBoolean(input.sortDesc, true),
    tradeDate: cleanString(input.tradeDate),
    isLimited: cleanBoolean(input.isLimited),
    dataSource: cleanNullableString(input.dataSource),
    dataMode: cleanNullableString(input.dataMode),
    dataAsOf: cleanNullableString(input.dataAsOf),
    coveragePct: cleanNullableNumber(input.coveragePct),
    universeSize: cleanNullableNumber(input.universeSize),
    elapsedMs: cleanNullablePositiveInteger(input.elapsedMs),
    filters: cleanFilters(input.filters),
    topSymbols,
    results,
    savedAt,
  };
}

function sanitizeHistoryEntry(value: unknown): ScannerRunHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const results = cleanResults(item.results);
  if (results.length === 0) return null;
  const savedAt = cleanNumber(item.savedAt);
  if (savedAt <= 0) return null;
  return createScannerRunHistoryEntry({
    label: cleanString(item.label, "Custom scan"),
    presetId: cleanNullableString(item.presetId),
    totalMatches: cleanNumber(item.totalMatches, results.length),
    totalPages: cleanNumber(item.totalPages, 1),
    currentPage: cleanNumber(item.currentPage, 1),
    pageSize: cleanNumber(item.pageSize, 25),
    sortBy: cleanString(item.sortBy, "volume_ratio"),
    sortDesc: cleanBoolean(item.sortDesc, true),
    tradeDate: cleanString(item.tradeDate),
    isLimited: cleanBoolean(item.isLimited),
    dataSource: cleanNullableString(item.dataSource),
    dataMode: cleanNullableString(item.dataMode),
    dataAsOf: cleanNullableString(item.dataAsOf),
    coveragePct: cleanNullableNumber(item.coveragePct),
    universeSize: cleanNullableNumber(item.universeSize),
    elapsedMs: cleanNullablePositiveInteger(item.elapsedMs),
    filters: cleanFilters(item.filters),
    results,
  }, savedAt);
}

export function formatScannerRunDuration(elapsedMs: number | null): string | null {
  if (elapsedMs == null) return null;
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

export function readScannerRunHistory(storage = browserStorage()): ScannerRunHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SCANNER_RUN_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeHistoryEntry)
      .filter((entry): entry is ScannerRunHistoryEntry => !!entry)
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, SCANNER_RUN_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeScannerRunHistory(entries: ScannerRunHistoryEntry[], storage = browserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(
      SCANNER_RUN_HISTORY_KEY,
      JSON.stringify(entries.slice(0, SCANNER_RUN_HISTORY_LIMIT)),
    );
  } catch {
    // Recent scanner runs are a local convenience, not source data.
  }
}

export function appendScannerRunHistory(input: ScannerRunHistoryInput, storage = browserStorage(), savedAt = Date.now()): ScannerRunHistoryEntry[] {
  const entry = createScannerRunHistoryEntry(input, savedAt);
  if (!storage || entry.results.length === 0) return [];
  const nextKey = historyKey(entry);
  const existing = readScannerRunHistory(storage).filter((item) => historyKey(item) !== nextKey);
  const next = [entry, ...existing].slice(0, SCANNER_RUN_HISTORY_LIMIT);
  writeScannerRunHistory(next, storage);
  return next;
}

export function clearScannerRunHistory(storage = browserStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(SCANNER_RUN_HISTORY_KEY);
  } catch {
    // Local history can fail silently.
  }
}
