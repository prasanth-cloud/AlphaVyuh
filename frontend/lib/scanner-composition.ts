export type ScannerCompositionMode = "and" | "or";

export type ScannerCompositionInput<T extends { symbol: string }> = {
  screenId: string;
  screenName: string;
  results: T[];
};

export type ScannerCompositionResult<T extends { symbol: string }> = T & {
  screen_matches: string[];
};

export function composeScannerResults<T extends { symbol: string }>(
  screens: ScannerCompositionInput<T>[],
  mode: ScannerCompositionMode,
): ScannerCompositionResult<T>[] {
  if (screens.length === 0) return [];

  const rows = new Map<string, ScannerCompositionResult<T>>();
  const counts = new Map<string, number>();

  for (const screen of screens) {
    const seenInScreen = new Set<string>();
    for (const row of screen.results) {
      const symbol = row.symbol.toUpperCase();
      if (seenInScreen.has(symbol)) continue;
      seenInScreen.add(symbol);

      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      const existing = rows.get(symbol);
      if (existing) {
        rows.set(symbol, {
          ...existing,
          screen_matches: [...existing.screen_matches, screen.screenName],
        });
      } else {
        rows.set(symbol, {
          ...row,
          symbol,
          screen_matches: [screen.screenName],
        });
      }
    }
  }

  if (mode === "or") return Array.from(rows.values());

  return Array.from(rows.values()).filter((row) => counts.get(row.symbol) === screens.length);
}

