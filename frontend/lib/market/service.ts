import { getCachedMarketData, setCachedMarketData } from "@/lib/market/cache";
import {
  getFallbackHistory,
  getFallbackIndices,
  getFallbackMovers,
  getFallbackQuote,
} from "@/lib/market/fallback-data";
import type {
  HistoryResponse,
  IndexResponse,
  MarketRegion,
  MoversResponse,
  QuoteResponse,
} from "@/lib/market/types";
import {
  getRegionHeroSymbol,
  getYahooHistory,
  getYahooIndices,
  getYahooMovers,
  getYahooQuote,
} from "@/lib/market/yahoo";

export async function fetchQuote(symbol: string): Promise<QuoteResponse> {
  const cacheKey = `quote:${symbol.toUpperCase()}`;
  try {
    const payload = await getYahooQuote(symbol);
    setCachedMarketData(cacheKey, payload);
    return payload;
  } catch {
    const cached = getCachedMarketData<QuoteResponse>(cacheKey);
    if (cached) return { ...cached, source: "cache", isDemoData: true };
    return setCachedMarketData(cacheKey, getFallbackQuote(symbol));
  }
}

export async function fetchIndices(region: MarketRegion): Promise<IndexResponse> {
  const cacheKey = `indices:${region}`;
  try {
    const payload = await getYahooIndices(region);
    setCachedMarketData(cacheKey, payload);
    return payload;
  } catch {
    const cached = getCachedMarketData<IndexResponse>(cacheKey);
    if (cached) return { ...cached, source: "cache", isDemoData: true };
    return setCachedMarketData(cacheKey, getFallbackIndices(region));
  }
}

export async function fetchMovers(region: MarketRegion): Promise<MoversResponse> {
  const cacheKey = `movers:${region}`;
  try {
    const payload = await getYahooMovers(region);
    setCachedMarketData(cacheKey, payload);
    return payload;
  } catch {
    const cached = getCachedMarketData<MoversResponse>(cacheKey);
    if (cached) return { ...cached, source: "cache", isDemoData: true };
    return setCachedMarketData(cacheKey, getFallbackMovers(region));
  }
}

export async function fetchHistory(symbol: string): Promise<HistoryResponse> {
  const cacheKey = `history:${symbol.toUpperCase()}`;
  try {
    const payload = await getYahooHistory(symbol);
    setCachedMarketData(cacheKey, payload);
    return payload;
  } catch {
    const cached = getCachedMarketData<HistoryResponse>(cacheKey);
    if (cached) return { ...cached, source: "cache", isDemoData: true };
    return setCachedMarketData(cacheKey, getFallbackHistory(symbol));
  }
}

export function heroSymbolForRegion(region: MarketRegion): string {
  return getRegionHeroSymbol(region);
}
