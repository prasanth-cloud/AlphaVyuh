import type { ScannerIdeaContext } from "@/lib/api/types";

export function buildChartSnapshotMetadata(
  symbol: string,
  entryPrice: number,
  timeframe = "D",
): NonNullable<ScannerIdeaContext["chart_snapshot"]> {
  const normalized = symbol.trim().toUpperCase();
  return {
    chart_url: `/charts/${normalized}?full=1`,
    symbol: normalized,
    timeframe,
    entry_price: entryPrice,
    captured_at: new Date().toISOString(),
  };
}
