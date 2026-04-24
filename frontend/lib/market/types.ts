export type MarketRegion = "IN" | "US";

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  exchange: string;
  marketState?: string;
}

export interface MarketMover extends MarketQuote {
  volume?: number;
}

export interface HistoryBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface QuoteResponse {
  quote: MarketQuote;
  source: "mock" | "cache" | "yahoo";
  asOf: string;
  isDemoData?: boolean;
}

export interface IndexResponse {
  region: MarketRegion;
  tickers: MarketQuote[];
  source: "mock" | "cache" | "yahoo";
  asOf: string;
  isDemoData?: boolean;
}

export interface MoversResponse {
  region: MarketRegion;
  gainers: MarketMover[];
  losers: MarketMover[];
  mostActive: MarketMover[];
  source: "mock" | "cache" | "yahoo";
  asOf: string;
  isDemoData?: boolean;
}

export interface HistoryResponse {
  symbol: string;
  bars: HistoryBar[];
  source: "mock" | "cache" | "yahoo";
  asOf: string;
  isDemoData?: boolean;
}
