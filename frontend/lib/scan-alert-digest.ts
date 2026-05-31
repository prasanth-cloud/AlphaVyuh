import type { ScanAlertMatch } from "@/lib/api";

export type ScanAlertDigest = {
  current: ScanAlertMatch;
  previous: ScanAlertMatch | null;
  entered: ScanAlertMatch["symbols"];
  continuing: ScanAlertMatch["symbols"];
  exited: string[];
  summary: string;
};

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function sortMatches(matches: ScanAlertMatch[]): ScanAlertMatch[] {
  return [...matches].sort((a, b) => {
    const dateDiff = b.run_date.localeCompare(a.run_date);
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });
}

export function buildScanAlertDigests(matches: ScanAlertMatch[]): ScanAlertDigest[] {
  const byAlert = new Map<string, ScanAlertMatch[]>();
  for (const match of matches) {
    const current = byAlert.get(match.alert_id) ?? [];
    current.push(match);
    byAlert.set(match.alert_id, current);
  }

  return sortMatches(matches).map((current) => {
    const previous = sortMatches(byAlert.get(current.alert_id) ?? [])
      .filter((candidate) => candidate.run_date < current.run_date)
      .at(0) ?? null;
    const previousSymbols = new Set((previous?.symbols ?? []).map((symbol) => symbolKey(symbol.symbol)));
    const currentSymbols = new Set(current.symbols.map((symbol) => symbolKey(symbol.symbol)));
    const entered = current.symbols.filter((symbol) => !previousSymbols.has(symbolKey(symbol.symbol)));
    const continuing = current.symbols.filter((symbol) => previousSymbols.has(symbolKey(symbol.symbol)));
    const exited = (previous?.symbols ?? [])
      .map((symbol) => symbolKey(symbol.symbol))
      .filter((symbol) => !currentSymbols.has(symbol));
    const summary = previous
      ? `${entered.length} entered · ${continuing.length} still matching · ${exited.length} exited`
      : `${current.symbols.length} current matches · first tracked run`;

    return {
      current,
      previous,
      entered,
      continuing,
      exited,
      summary,
    };
  });
}
