import YahooFinance from "yahoo-finance2";
import type {
  HistoryBar,
  HistoryResponse,
  IndexResponse,
  MarketMover,
  MarketQuote,
  MarketRegion,
  MoversResponse,
  QuoteResponse,
} from "@/lib/market/types";

const yahooFinance = new YahooFinance();
const nowIso = () => new Date().toISOString();

type YahooQuoteLike = {
  symbol: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  postMarketPrice?: number;
  currency?: string;
  exchange?: string;
  fullExchangeName?: string;
  marketState?: string;
  regularMarketVolume?: number;
};

type YahooChartLike = {
  timestamp?: number[];
  indicators: {
    quote: Array<{
      open: Array<number | null>;
      high: Array<number | null>;
      low: Array<number | null>;
      close: Array<number | null>;
      volume: Array<number | null>;
    }>;
  };
};

const REGION_CONFIG: Record<MarketRegion, {
  quoteSymbols: string[];
  heroSymbol: string;
  queryRegion: string;
  lang: string;
}> = {
  IN: {
    quoteSymbols: ["^NSEI", "^BSESN", "^NSEBANK", "^CNXIT", "^INDIAVIX"],
    heroSymbol: "RELIANCE.NS",
    queryRegion: "IN",
    lang: "en-IN",
  },
  US: {
    quoteSymbols: ["SPY", "QQQ", "DIA", "^VIX", "^RUT"],
    heroSymbol: "AAPL",
    queryRegion: "US",
    lang: "en-US",
  },
};

function toMarketQuote(quote: YahooQuoteLike): MarketQuote {
  const price = quote.regularMarketPrice ?? quote.postMarketPrice ?? 0;
  const change = quote.regularMarketChange ?? 0;
  const changePercent = quote.regularMarketChangePercent ?? 0;

  return {
    symbol: quote.symbol,
    name: quote.longName || quote.shortName || quote.symbol,
    price,
    change,
    changePercent,
    currency: quote.currency ?? "USD",
    exchange: quote.exchange || quote.fullExchangeName || "YAHOO",
    marketState: quote.marketState,
  };
}

function toMarketMover(quote: YahooQuoteLike): MarketMover {
  return {
    ...toMarketQuote(quote),
    volume: quote.regularMarketVolume,
  };
}

function mapChartBars(result: YahooChartLike): HistoryBar[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators.quote?.[0];
  if (!quote) return [];

  return timestamps.flatMap((timestamp: number, index: number) => {
    const open = quote.open[index];
    const high = quote.high[index];
    const low = quote.low[index];
    const close = quote.close[index];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null
    ) {
      return [];
    }

    return [{
      time: timestamp * 1000,
      open,
      high,
      low,
      close,
      volume: quote.volume[index] ?? undefined,
    }];
  });
}

export async function getYahooQuote(symbol: string): Promise<QuoteResponse> {
  const quote = await yahooFinance.quote(symbol) as YahooQuoteLike;
  return {
    quote: toMarketQuote(quote),
    source: "yahoo",
    asOf: nowIso(),
  };
}

export async function getYahooIndices(region: MarketRegion): Promise<IndexResponse> {
  const config = REGION_CONFIG[region];
  const quotes = await yahooFinance.quote(config.quoteSymbols) as YahooQuoteLike[];
  return {
    region,
    tickers: quotes.map(toMarketQuote),
    source: "yahoo",
    asOf: nowIso(),
  };
}

export async function getYahooMovers(region: MarketRegion): Promise<MoversResponse> {
  const config = REGION_CONFIG[region];
  const [gainers, losers, mostActive] = await Promise.all([
    yahooFinance.screener({ scrIds: "day_gainers", count: 5, region: config.queryRegion, lang: config.lang }),
    yahooFinance.screener({ scrIds: "day_losers", count: 5, region: config.queryRegion, lang: config.lang }),
    yahooFinance.screener({ scrIds: "most_actives", count: 5, region: config.queryRegion, lang: config.lang }),
  ]);

  return {
    region,
    gainers: (gainers.quotes as YahooQuoteLike[]).slice(0, 5).map(toMarketMover),
    losers: (losers.quotes as YahooQuoteLike[]).slice(0, 5).map(toMarketMover),
    mostActive: (mostActive.quotes as YahooQuoteLike[]).slice(0, 5).map(toMarketMover),
    source: "yahoo",
    asOf: nowIso(),
  };
}

export async function getYahooHistory(symbol: string): Promise<HistoryResponse> {
  const end = Date.now();
  const start = end - 24 * 60 * 60 * 1000;
  const result = await yahooFinance.chart(symbol, {
    period1: start,
    period2: end,
    interval: "5m",
    return: "object",
    lang: symbol.endsWith(".NS") ? "en-IN" : "en-US",
  }) as YahooChartLike;

  return {
    symbol,
    bars: mapChartBars(result),
    source: "yahoo",
    asOf: nowIso(),
  };
}

export function getRegionHeroSymbol(region: MarketRegion): string {
  return REGION_CONFIG[region].heroSymbol;
}
