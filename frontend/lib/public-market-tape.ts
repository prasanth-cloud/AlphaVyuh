/**
 * Public landing-page market tape built from free Yahoo Finance quote data.
 * Server-side only fetch (route handler) — the landing page consumes
 * /api/public/market-tape and must show an honest unavailable state on failure.
 */

export type TapeQuote = {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  isIndex: boolean;
};

export type MarketTapePayload = {
  quotes: TapeQuote[];
  asOf: string;
  source: "yahoo-finance";
};

export const TAPE_SYMBOLS: Array<{ yahoo: string; label: string; isIndex: boolean }> = [
  { yahoo: "^NSEI", label: "NIFTY 50", isIndex: true },
  { yahoo: "^BSESN", label: "SENSEX", isIndex: true },
  { yahoo: "^NSEBANK", label: "BANKNIFTY", isIndex: true },
  { yahoo: "RELIANCE.NS", label: "RELIANCE", isIndex: false },
  { yahoo: "HDFCBANK.NS", label: "HDFCBANK", isIndex: false },
  { yahoo: "ICICIBANK.NS", label: "ICICIBANK", isIndex: false },
  { yahoo: "TCS.NS", label: "TCS", isIndex: false },
  { yahoo: "INFY.NS", label: "INFY", isIndex: false },
  { yahoo: "SBIN.NS", label: "SBIN", isIndex: false },
  { yahoo: "BHARTIARTL.NS", label: "BHARTIARTL", isIndex: false },
  { yahoo: "ITC.NS", label: "ITC", isIndex: false },
  { yahoo: "LT.NS", label: "LT", isIndex: false },
  { yahoo: "BAJFINANCE.NS", label: "BAJFINANCE", isIndex: false },
  { yahoo: "MARUTI.NS", label: "MARUTI", isIndex: false },
  { yahoo: "TATAMOTORS.NS", label: "TATAMOTORS", isIndex: false },
];

/** Minimum quotes required before the tape is considered trustworthy. */
export const TAPE_MIN_QUOTES = 5;

type YahooChartMeta = {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  symbol?: string;
};

export function parseYahooChartMeta(
  body: unknown,
  symbol: { yahoo: string; label: string; isIndex: boolean },
): TapeQuote | null {
  if (typeof body !== "object" || body === null) return null;
  const meta = (body as { chart?: { result?: Array<{ meta?: YahooChartMeta }> } })
    .chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(prevClose) || prevClose <= 0) return null;

  return {
    symbol: symbol.yahoo,
    label: symbol.label,
    price,
    changePct: ((price - prevClose) / prevClose) * 100,
    isIndex: symbol.isIndex,
  };
}

/** Dedupe by label keeping the first occurrence, preserving input order. */
export function dedupeQuotes(quotes: TapeQuote[]): TapeQuote[] {
  const seen = new Set<string>();
  const result: TapeQuote[] = [];
  for (const quote of quotes) {
    if (seen.has(quote.label)) continue;
    seen.add(quote.label);
    result.push(quote);
  }
  return result;
}

/** Top stock movers for the hero card: stocks only, sorted by |change|, unique. */
export function topMovers(quotes: TapeQuote[], count = 5): TapeQuote[] {
  return dedupeQuotes(quotes.filter((quote) => !quote.isIndex))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, count);
}

export function formatTapePrice(value: number): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: value < 1000 ? 2 : 0,
    maximumFractionDigits: value < 1000 ? 2 : 0,
  });
}

export function formatTapeChange(changePct: number): string {
  const sign = changePct >= 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}
