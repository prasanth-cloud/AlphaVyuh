import { NextResponse } from "next/server";
import {
  TAPE_MIN_QUOTES,
  TAPE_SYMBOLS,
  dedupeQuotes,
  mockMarketTapePayload,
  parseYahooChartMeta,
  type TapeQuote,
} from "@/lib/public-market-tape";

export const revalidate = 300;

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AlphaVyuhTape/1.0; +https://alphavyuh.com)",
  Accept: "application/json",
};

function shouldUseMockTape() {
  return process.env.NEXT_PUBLIC_DATA_MODE === "mock";
}

async function fetchQuote(symbol: (typeof TAPE_SYMBOLS)[number]): Promise<TapeQuote | null> {
  try {
    const response = await fetch(
      `${YAHOO_CHART_URL}/${encodeURIComponent(symbol.yahoo)}?range=1d&interval=1d`,
      { headers: FETCH_HEADERS, next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    return parseYahooChartMeta(await response.json(), symbol);
  } catch {
    return null;
  }
}

export async function GET() {
  if (shouldUseMockTape()) {
    return NextResponse.json(
      mockMarketTapePayload(),
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = await Promise.all(TAPE_SYMBOLS.map(fetchQuote));
  const quotes = dedupeQuotes(results.filter((quote): quote is TapeQuote => quote !== null));

  if (quotes.length < TAPE_MIN_QUOTES) {
    return NextResponse.json(
      { error: "Live market tape is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { quotes, asOf: new Date().toISOString(), source: "yahoo-finance" },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=240",
        "CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
