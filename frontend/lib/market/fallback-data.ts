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

const nowIso = () => new Date().toISOString();
const intradayBaseTime = Date.UTC(2026, 3, 24, 9, 15);

const INDIA_INDEX_TICKERS: MarketQuote[] = [
  { symbol: "^NSEI", name: "NIFTY 50", price: 22412.35, change: 182.45, changePercent: 0.82, currency: "INR", exchange: "NSE" },
  { symbol: "^BSESN", name: "SENSEX", price: 73881.12, change: 511.84, changePercent: 0.70, currency: "INR", exchange: "BSE" },
  { symbol: "^NSEBANK", name: "BANK NIFTY", price: 48344.7, change: 266.2, changePercent: 0.55, currency: "INR", exchange: "NSE" },
  { symbol: "^CNXIT", name: "NIFTY IT", price: 33758.15, change: -188.5, changePercent: -0.56, currency: "INR", exchange: "NSE" },
  { symbol: "^INDIAVIX", name: "INDIA VIX", price: 13.42, change: -0.28, changePercent: -2.04, currency: "INR", exchange: "NSE" },
];

const US_INDEX_TICKERS: MarketQuote[] = [
  { symbol: "SPY", name: "SPDR S&P 500", price: 522.84, change: 4.18, changePercent: 0.81, currency: "USD", exchange: "NYSEARCA" },
  { symbol: "QQQ", name: "Invesco QQQ", price: 446.27, change: 5.01, changePercent: 1.14, currency: "USD", exchange: "NASDAQ" },
  { symbol: "DIA", name: "SPDR Dow Jones", price: 391.88, change: 1.27, changePercent: 0.33, currency: "USD", exchange: "NYSEARCA" },
  { symbol: "^VIX", name: "VIX", price: 14.11, change: -0.44, changePercent: -3.02, currency: "USD", exchange: "CBOE" },
  { symbol: "^RUT", name: "Russell 2000", price: 2051.62, change: 16.03, changePercent: 0.79, currency: "USD", exchange: "RUSSELL" },
];

const INDIA_GAINERS: MarketMover[] = [
  { symbol: "DIXON.NS", name: "Dixon Technologies", price: 14220, change: 439.4, changePercent: 3.19, currency: "INR", exchange: "NSE", volume: 422100 },
  { symbol: "CAMS.NS", name: "CAMS", price: 3412.4, change: 77.6, changePercent: 2.33, currency: "INR", exchange: "NSE", volume: 301990 },
  { symbol: "PERSISTENT.NS", name: "Persistent Systems", price: 4956.2, change: 120.1, changePercent: 2.48, currency: "INR", exchange: "NSE", volume: 512300 },
  { symbol: "RELIANCE.NS", name: "Reliance Industries", price: 2891.15, change: 34.9, changePercent: 1.22, currency: "INR", exchange: "NSE", volume: 3882200 },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", price: 1248.5, change: 13.7, changePercent: 1.11, currency: "INR", exchange: "NSE", volume: 4981200 },
];

const INDIA_LOSERS: MarketMover[] = [
  { symbol: "TCS.NS", name: "TCS", price: 3824.4, change: -74.5, changePercent: -1.91, currency: "INR", exchange: "NSE", volume: 2118800 },
  { symbol: "INFY.NS", name: "Infosys", price: 1634.1, change: -22.4, changePercent: -1.35, currency: "INR", exchange: "NSE", volume: 5614400 },
  { symbol: "LTIM.NS", name: "LTIMindtree", price: 4692.8, change: -51.2, changePercent: -1.08, currency: "INR", exchange: "NSE", volume: 420410 },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", price: 7240.2, change: -64.6, changePercent: -0.88, currency: "INR", exchange: "NSE", volume: 665120 },
  { symbol: "HCLTECH.NS", name: "HCLTech", price: 1518.6, change: -11.7, changePercent: -0.76, currency: "INR", exchange: "NSE", volume: 2208810 },
];

const INDIA_MOST_ACTIVE: MarketMover[] = [
  { symbol: "SBIN.NS", name: "State Bank of India", price: 786.4, change: -1.1, changePercent: -0.14, currency: "INR", exchange: "NSE", volume: 12561200 },
  { symbol: "RELIANCE.NS", name: "Reliance Industries", price: 2891.15, change: 34.9, changePercent: 1.22, currency: "INR", exchange: "NSE", volume: 3882200 },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", price: 1248.5, change: 13.7, changePercent: 1.11, currency: "INR", exchange: "NSE", volume: 4981200 },
  { symbol: "INFY.NS", name: "Infosys", price: 1634.1, change: -22.4, changePercent: -1.35, currency: "INR", exchange: "NSE", volume: 5614400 },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", price: 992.65, change: 8.2, changePercent: 0.83, currency: "INR", exchange: "NSE", volume: 7418200 },
];

const US_GAINERS: MarketMover[] = [
  { symbol: "NVDA", name: "NVIDIA", price: 955.12, change: 28.5, changePercent: 3.08, currency: "USD", exchange: "NASDAQ", volume: 41222000 },
  { symbol: "AAPL", name: "Apple", price: 183.84, change: 3.24, changePercent: 1.79, currency: "USD", exchange: "NASDAQ", volume: 52118000 },
  { symbol: "AMD", name: "AMD", price: 164.72, change: 2.65, changePercent: 1.63, currency: "USD", exchange: "NASDAQ", volume: 60121000 },
  { symbol: "MSFT", name: "Microsoft", price: 424.08, change: 5.4, changePercent: 1.29, currency: "USD", exchange: "NASDAQ", volume: 22110200 },
  { symbol: "META", name: "Meta", price: 506.2, change: 6.12, changePercent: 1.22, currency: "USD", exchange: "NASDAQ", volume: 18511200 },
];

const US_LOSERS: MarketMover[] = [
  { symbol: "TSLA", name: "Tesla", price: 162.45, change: -5.62, changePercent: -3.34, currency: "USD", exchange: "NASDAQ", volume: 85122100 },
  { symbol: "BA", name: "Boeing", price: 173.88, change: -3.12, changePercent: -1.76, currency: "USD", exchange: "NYSE", volume: 12110000 },
  { symbol: "PFE", name: "Pfizer", price: 26.42, change: -0.31, changePercent: -1.16, currency: "USD", exchange: "NYSE", volume: 28221000 },
  { symbol: "DIS", name: "Disney", price: 111.08, change: -1.02, changePercent: -0.91, currency: "USD", exchange: "NYSE", volume: 9302200 },
  { symbol: "SNOW", name: "Snowflake", price: 154.84, change: -1.21, changePercent: -0.78, currency: "USD", exchange: "NYSE", volume: 4418300 },
];

const US_MOST_ACTIVE: MarketMover[] = [
  { symbol: "AAPL", name: "Apple", price: 183.84, change: 3.24, changePercent: 1.79, currency: "USD", exchange: "NASDAQ", volume: 52118000 },
  { symbol: "TSLA", name: "Tesla", price: 162.45, change: -5.62, changePercent: -3.34, currency: "USD", exchange: "NASDAQ", volume: 85122100 },
  { symbol: "AMD", name: "AMD", price: 164.72, change: 2.65, changePercent: 1.63, currency: "USD", exchange: "NASDAQ", volume: 60121000 },
  { symbol: "NVDA", name: "NVIDIA", price: 955.12, change: 28.5, changePercent: 3.08, currency: "USD", exchange: "NASDAQ", volume: 41222000 },
  { symbol: "PLTR", name: "Palantir", price: 24.11, change: 0.58, changePercent: 2.47, currency: "USD", exchange: "NYSE", volume: 39022000 },
];

const heroHistory: Record<string, HistoryBar[]> = {
  "RELIANCE.NS": Array.from({ length: 78 }, (_, index) => {
    const open = 2854 + Math.sin(index / 5) * 14 + index * 0.42;
    const close = open + Math.sin(index / 2.8) * 6 + (index % 5 === 0 ? 9 : -1.8);
    const high = Math.max(open, close) + 6 + (index % 4);
    const low = Math.min(open, close) - 5 - (index % 3);
    return {
      time: intradayBaseTime + index * 5 * 60 * 1000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 150000 + index * 2800,
    };
  }),
  AAPL: Array.from({ length: 78 }, (_, index) => {
    const open = 178 + Math.sin(index / 4.6) * 1.8 + index * 0.06;
    const close = open + Math.sin(index / 3.1) * 0.9 + (index % 6 === 0 ? 1.4 : -0.12);
    const high = Math.max(open, close) + 0.6 + (index % 3) * 0.12;
    const low = Math.min(open, close) - 0.55 - (index % 2) * 0.08;
    return {
      time: intradayBaseTime + index * 5 * 60 * 1000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 900000 + index * 12000,
    };
  }),
};

const quoteIndex = new Map<string, MarketQuote>(
  [
    ...INDIA_INDEX_TICKERS,
    ...US_INDEX_TICKERS,
    ...INDIA_GAINERS,
    ...INDIA_LOSERS,
    ...INDIA_MOST_ACTIVE,
    ...US_GAINERS,
    ...US_LOSERS,
    ...US_MOST_ACTIVE,
  ].map((quote) => [quote.symbol.toUpperCase(), quote])
);

export function getFallbackIndices(region: MarketRegion): IndexResponse {
  return {
    region,
    tickers: region === "US" ? US_INDEX_TICKERS : INDIA_INDEX_TICKERS,
    source: "mock",
    asOf: nowIso(),
    isDemoData: true,
  };
}

export function getFallbackMovers(region: MarketRegion): MoversResponse {
  return {
    region,
    gainers: region === "US" ? US_GAINERS : INDIA_GAINERS,
    losers: region === "US" ? US_LOSERS : INDIA_LOSERS,
    mostActive: region === "US" ? US_MOST_ACTIVE : INDIA_MOST_ACTIVE,
    source: "mock",
    asOf: nowIso(),
    isDemoData: true,
  };
}

export function getFallbackQuote(symbol: string): QuoteResponse {
  const normalized = symbol.toUpperCase();
  const quote = quoteIndex.get(normalized)
    ?? {
      symbol: normalized,
      name: normalized.replace(/\.(NS|BO)$/, ""),
      price: normalized.endsWith(".NS") ? 1248.5 : 183.84,
      change: normalized.endsWith(".NS") ? 13.7 : 3.24,
      changePercent: normalized.endsWith(".NS") ? 1.11 : 1.79,
      currency: normalized.endsWith(".NS") ? "INR" : "USD",
      exchange: normalized.endsWith(".NS") ? "NSE" : "NASDAQ",
    };

  return {
    quote,
    source: "mock",
    asOf: nowIso(),
    isDemoData: true,
  };
}

export function getFallbackHistory(symbol: string): HistoryResponse {
  const normalized = symbol.toUpperCase();
  const bars = heroHistory[normalized] ?? heroHistory["RELIANCE.NS"];
  return {
    symbol: normalized,
    bars,
    source: "mock",
    asOf: nowIso(),
    isDemoData: true,
  };
}
