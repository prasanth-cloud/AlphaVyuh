const SYMBOL_COLUMN_NAMES = new Set([
  "symbol",
  "symbols",
  "tradingsymbol",
  "trading_symbol",
  "ticker",
  "scrip",
  "security",
]);

const HEADER_WORDS = new Set([
  "company",
  "companyname",
  "company_name",
  "exchange",
  "instrument",
  "instrumentkey",
  "instrument_key",
  "isin",
  "name",
  "sector",
  "series",
]);

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function cleanSymbol(value: string): string | null {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/^NSE[:\s-]*/, "")
    .replace(/\.NS$/, "")
    .replace(/[^A-Z0-9&-]/g, "");
  if (!cleaned || SYMBOL_COLUMN_NAMES.has(cleaned.toLowerCase()) || HEADER_WORDS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function detectSymbolColumn(header: string[]): number | null {
  const index = header.findIndex((cell) => SYMBOL_COLUMN_NAMES.has(normalizeColumnName(cell)));
  return index >= 0 ? index : null;
}

export type WatchlistSymbolImport = {
  symbols: string[];
  duplicateCount: number;
  ignoredCount: number;
  truncatedCount: number;
};

export function parseWatchlistSymbolImport(input: string | null | undefined, limit = 50): WatchlistSymbolImport {
  const raw = input ?? "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const symbols: string[] = [];
  let duplicateCount = 0;
  let ignoredCount = 0;
  let symbolColumn: number | null = null;
  let firstLineWasHeader = false;

  function addCandidate(candidate: string) {
    const symbol = cleanSymbol(candidate);
    if (!symbol) {
      ignoredCount += 1;
      return;
    }
    if (seen.has(symbol)) {
      duplicateCount += 1;
      return;
    }
    seen.add(symbol);
    if (symbols.length < limit) {
      symbols.push(symbol);
    }
  }

  if (lines.length > 0) {
    const header = splitCsvLine(lines[0]);
    symbolColumn = detectSymbolColumn(header);
    firstLineWasHeader = symbolColumn != null;
  }

  if (symbolColumn != null) {
    for (const [index, line] of lines.entries()) {
      if (index === 0 && firstLineWasHeader) continue;
      const cells = splitCsvLine(line);
      addCandidate(cells[symbolColumn] ?? "");
    }
  } else {
    const parts = raw.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) addCandidate(part);
  }

  return {
    symbols,
    duplicateCount,
    ignoredCount,
    truncatedCount: Math.max(0, seen.size - symbols.length),
  };
}
