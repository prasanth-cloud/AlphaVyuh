import { createClient } from './supabase/client'
import {
  mockCandles,
  mockIndicators,
  mockJournalAnalytics,
  mockJournalEntries,
  mockJournalStats,
  mockLiveQuote,
  mockMarketMovers,
  mockMarketOverview,
  mockMarketSummary,
  mockPortfolio,
  mockPriceAlerts,
  mockQuote,
  mockRunScan,
  mockSearchSymbols,
  mockSectorBreadth,
  mockWatchlists,
} from './mock-data'

const API = process.env.NEXT_PUBLIC_API_URL!;
const forceLiveData = process.env.NEXT_PUBLIC_FORCE_LIVE_DATA === "true";
export const liveQuotePollingEnabled =
  forceLiveData || process.env.NEXT_PUBLIC_ENABLE_LIVE_QUOTES === "true";
export const isMockMode =
  !forceLiveData &&
  (process.env.NEXT_PUBLIC_DATA_MODE === "mock" ||
    process.env.NEXT_PUBLIC_ALLOW_MOCK_FALLBACK === "true" ||
    process.env.NODE_ENV === "development");

let tokenCache: { token: string | null; expiresAt: number } | null = null;
let tokenPromise: Promise<string | null> | null = null;
type ClientCacheEntry<T> = { value: T; expiresAt: number };
const clientCache = new Map<string, ClientCacheEntry<unknown>>();
const clientCachePromises = new Map<string, Promise<unknown>>();

function readClientCache<T>(key: string): T | null {
  const cached = clientCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.value as T;
}

function writeClientCache<T>(key: string, value: T, ttlMs: number): T {
  clientCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function cachedClientRequest<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = readClientCache<T>(key);
  if (cached !== null) return cached;

  const pending = clientCachePromises.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((value) => writeClientCache(key, value, ttlMs))
    .finally(() => {
      clientCachePromises.delete(key);
    });
  clientCachePromises.set(key, promise);
  return promise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

function invalidateClientCache(prefixes: string[]) {
  for (const key of clientCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      clientCache.delete(key);
    }
  }
}

function shouldUseMockFallback(): boolean {
  return isMockMode;
}

async function getToken(): Promise<string | null> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const sb = createClient()
      const { data } = await sb.auth.getSession()
      const token = data.session?.access_token ?? null
      tokenCache = { token, expiresAt: Date.now() + 30_000 }
      return token
    } catch {
      tokenCache = { token: null, expiresAt: Date.now() + 5_000 }
      return null
    } finally {
      tokenPromise = null
    }
  })();

  return tokenPromise;
}

export function clearAuthHeaderCache() {
  tokenCache = null;
  tokenPromise = null;
  clientCache.clear();
  clientCachePromises.clear();
}

export async function authHeaders(): Promise<HeadersInit> {
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// Public endpoints don't need auth — just JSON content-type
const publicHeaders: HeadersInit = { "Content-Type": "application/json" };

export type ScanResult = {
  symbol: string;
  company_name: string;
  series: string;
  sector: string | null;
  market?: string;
  currency?: string;
  close: number;
  prev_close: number;
  open: number;
  high: number;
  low: number;
  pct_change: number | null;
  gap_pct: number | null;
  volume: number;
  avg_volume_20d: number;
  volume_ratio: number | null;
  turnover: number | null;
  rsi_14: number | null;
  ema_20: number | null;
  ema_50: number | null;
  ema_200: number | null;
  ema_20_dist: number | null;
  ema_50_dist: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  week_52_high_pct: number | null;
  week_52_low_pct: number | null;
  atr_14: number | null;
  atr_pct: number | null;
  turnover_cr?: number | null;
  macd_hist?: number | null;
  bb_width?: number | null;
  stoch_k?: number | null;
  adx_14?: number | null;
  delivery_pct?: number | null;
  is_new_52w_high?: boolean;
  is_inside_bar?: boolean;
  rs_score?: number | null;
  market_cap_cr?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  eps?: number | null;
  dividend_yield?: number | null;
  roe?: number | null;
  roce?: number | null;
};

export type ScanFilters = {
  // Price & Performance
  price_min?: number;
  price_max?: number;
  pct_change_min?: number;
  pct_change_max?: number;
  gap_pct_min?: number;
  gap_pct_max?: number;
  high_min?: number;
  low_max?: number;
  // Volume
  volume_min?: number;
  volume_max?: number;
  volume_ratio_min?: number;
  volume_ratio_max?: number;
  turnover_min?: number;
  turnover_max?: number;
  // Momentum
  rsi_min?: number;
  rsi_max?: number;
  // Trend
  above_ema20?: boolean;
  below_ema20?: boolean;
  above_ema50?: boolean;
  below_ema50?: boolean;
  above_ema200?: boolean;
  below_ema200?: boolean;
  ema20_above_ema50?: boolean;
  ema50_above_ema200?: boolean;
  all_emas_bullish?: boolean;
  all_emas_bearish?: boolean;
  ema20_dist_min?: number;
  ema20_dist_max?: number;
  ema50_dist_min?: number;
  ema50_dist_max?: number;
  // Volatility
  atr_min?: number;
  atr_max?: number;
  atr_pct_min?: number;
  atr_pct_max?: number;
  // 52-Week
  w52h_pct_max?: number;
  week_52_high_pct_max?: number;  // alias for w52h_pct_max (new scanner UI)
  w52l_pct_min?: number;
  new_52w_high?: boolean;
  new_52w_low?: boolean;
  // EMA position aliases (new scanner UI: 'above' | 'below')
  price_vs_ema20?: string;
  price_vs_ema50?: string;
  price_vs_ema200?: string;
  // Market
  series?: string[];
  sector?: string;
  market?: string;  // "IN" | "US" | "NSE" | "BSE" | "NASDAQ" | "NYSE"
};

export type Market = {
  key: string;
  label: string;
  currency: string;
  count: number;
};

export async function getMarkets(): Promise<Market[]> {
  const res = await fetch(`${API}/api/v1/market/markets`, { headers: publicHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return data.markets ?? [];
}

export type ScanResponse = {
  trade_date: string;
  total_matches: number;
  plan_limit: number;
  plan?: string;
  results: ScanResult[];
};

export type MarketSummary = {
  trade_date: string;
  advances: number;
  declines: number;
  unchanged: number;
  advance_decline_ratio: number | null;
  new_52w_highs: number;
  new_52w_lows: number;
  above_ema20_pct: number | null;
  above_ema50_pct: number | null;
  above_ema200_pct: number | null;
  total_stocks: number;
};

export type WatchlistItem = {
  symbol: string;
  sort_order: number;
  added_at: string;
  company_name?: string;
  sector?: string | null;
  close?: number;
  pct_change?: number | null;
  volume_ratio?: number | null;
  rsi_14?: number | null;
  pinned?: boolean;
  tags?: string[];
  note?: string | null;
};

export type Watchlist = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  items: WatchlistItem[];
};

export type SavedScreen = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
};

export async function runScan(
  filters: ScanFilters,
  sort_by = "volume_ratio",
  sort_order = "desc",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _limit?: number   // limit is enforced server-side by plan
): Promise<ScanResponse> {
  if (shouldUseMockFallback()) return mockRunScan();
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filters, sort_by, sort_order }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Session expired — please refresh the page");
    if (res.status === 503 || res.status === 502) throw new Error("Server is temporarily unavailable — try again in a moment");
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Scan failed (${res.status})`);
  }
  return res.json();
}

export async function getScreens(): Promise<SavedScreen[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/screens`, { headers });
  if (!res.ok) return [];
  return res.json();
}

export async function saveScreen(name: string, filters: Record<string, unknown>): Promise<SavedScreen> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/screens`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, filters }),
  });
  if (!res.ok) throw new Error("Save failed");
  return res.json();
}

export async function deleteScreen(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/scanner/screens/${id}`, { method: "DELETE", headers });
}

export async function getWatchlists(): Promise<Watchlist[]> {
  if (shouldUseMockFallback()) return mockWatchlists();
  return cachedClientRequest("watchlists", 30_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/watchlists`, { headers });
      if (!res.ok) return shouldUseMockFallback() ? mockWatchlists() : [];
      const data = await res.json();
      return data.watchlists ?? [];
    } catch {
      return shouldUseMockFallback() ? mockWatchlists() : [];
    }
  });
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const created = await res.json();
  invalidateClientCache(["watchlists"]);
  return created;
}

export async function deleteWatchlist(watchlistId: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/watchlists/${watchlistId}`, { method: "DELETE", headers });
  invalidateClientCache(["watchlists"]);
}

export async function addToWatchlist(watchlistId: string, symbol: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({ symbol }),
  });
  if (res.status === 409) throw new Error("Already in watchlist");
  if (!res.ok) throw new Error("Add failed");
  invalidateClientCache(["watchlists"]);
}

export async function removeFromWatchlist(watchlistId: string, symbol: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/${symbol}`, {
    method: "DELETE",
    headers,
  });
  invalidateClientCache(["watchlists"]);
}

export async function reorderWatchlist(
  watchlistId: string,
  items: { symbol: string; sort_order: number }[]
): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/reorder`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ items }),
  });
  invalidateClientCache(["watchlists"]);
}

export type WatchlistItemMetadataUpdate = {
  pinned?: boolean;
  tags?: string[];
  note?: string | null;
};

export async function updateWatchlistItemMetadata(
  watchlistId: string,
  symbol: string,
  updates: WatchlistItemMetadataUpdate
): Promise<WatchlistItem> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/${symbol}/metadata`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Metadata update failed" }));
    throw new Error(body.detail ?? "Metadata update failed");
  }
  const updated = await res.json();
  invalidateClientCache(["watchlists"]);
  return updated;
}

export async function getMarketSummary(): Promise<MarketSummary | null> {
  if (shouldUseMockFallback()) return mockMarketSummary();
  try {
    const res = await fetch(`${API}/api/v1/market/summary`, { headers: publicHeaders });
    if (!res.ok) return shouldUseMockFallback() ? mockMarketSummary() : null;
    return res.json();
  } catch {
    return shouldUseMockFallback() ? mockMarketSummary() : null;
  }
}

export async function getQuote(symbol: string): Promise<ScanResult | null> {
  if (shouldUseMockFallback()) return mockQuote(symbol);
  const sym = symbol.toUpperCase();
  return cachedClientRequest(`quote:${sym}`, 20_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/stocks/${sym}/quote`, { headers });
      if (!res.ok) return shouldUseMockFallback() ? mockQuote(sym) : null;
      return res.json();
    } catch {
      return shouldUseMockFallback() ? mockQuote(sym) : null;
    }
  });
}

export type LiveQuote = {
  symbol: string;
  market: string;
  currency: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  prev_close: number;
  pct_change: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  source: string;
};

export async function getQuoteLive(symbol: string): Promise<LiveQuote | null> {
  if (shouldUseMockFallback()) return mockLiveQuote(symbol);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/stocks/${symbol}/quote-live`, { headers });
    if (!res.ok) return shouldUseMockFallback() ? mockLiveQuote(symbol) : null;
    return res.json();
  } catch {
    return shouldUseMockFallback() ? mockLiveQuote(symbol) : null;
  }
}

// ── Charts ────────────────────────────────────────────────────────────────────

export type CandleBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema_20?: number | null;
  ema_50?: number | null;
  ema_200?: number | null;
};

export type CandlesResponse = {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  timeframe: string;
  candles: CandleBar[];
  latest: {
    close: number;
    pct_change: number | null;
    volume: number;
    volume_ratio: number | null;
    rsi_14: number | null;
    ema_20: number | null;
    ema_50: number | null;
    ema_200: number | null;
    atr_14: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    open: number;
    high: number;
    low: number;
    prev_close: number | null;
  };
};

export type IndicatorsResponse = {
  symbol: string;
  indicators: Record<string, unknown[]>;
};

export type SymbolSearchResult = {
  symbol: string;
  company_name: string;
  sector: string | null;
  series: string;
};

export type Drawing = {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string;
  tool_type: string;
  points: unknown[];
  style: Record<string, unknown>;
  created_at: string;
};

export type ChartLayout = {
  id?: string;
  symbol: string;
  timeframe: string;
  indicators: string[];
  drawing_tools: unknown[];
};

export type ChartWorkspaceIndicator = {
  type: "ema" | "sma" | "vwap" | "rsi" | "macd" | "volume";
  params?: Record<string, unknown>;
};

export type ChartWorkspaceDrawing =
  | { id: string; kind: "trendline"; p1: { time: string; price: number }; p2: { time: string; price: number }; color: string; width: number }
  | { id: string; kind: "hline"; price: number; color: string; width: number; label?: string }
  | { id: string; tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe?: string; created_at?: string };

export type ChartWorkspace = {
  symbol: string;
  timeframe: string;
  indicators: ChartWorkspaceIndicator[];
  drawings: ChartWorkspaceDrawing[];
};

export async function getCandles(
  symbol: string,
  params?: { from_date?: string; to_date?: string; limit?: number; timeframe?: string }
): Promise<CandlesResponse> {
  if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
  const qs = new URLSearchParams();
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.timeframe) qs.set("timeframe", params.timeframe);
  try {
    const res = await fetch(`${API}/api/v1/charts/${symbol}/candles?${qs}`, { headers: publicHeaders });
    if (!res.ok) {
      if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
      throw new Error(`No data for ${symbol}`);
    }
    return res.json();
  } catch (error) {
    if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
    throw error;
  }
}

export async function getIndicators(
  symbol: string,
  indicators: string[],
  timeframe = "D"
): Promise<IndicatorsResponse> {
  if (shouldUseMockFallback()) return mockIndicators(symbol);
  try {
    const res = await fetch(
      `${API}/api/v1/charts/${symbol}/indicators?indicators=${indicators.join(",")}&timeframe=${timeframe}`,
      { headers: publicHeaders }
    );
    if (!res.ok) {
      if (shouldUseMockFallback()) return mockIndicators(symbol);
      throw new Error("Indicator fetch failed");
    }
    return res.json();
  } catch (error) {
    if (shouldUseMockFallback()) return mockIndicators(symbol);
    throw error;
  }
}

export type MarketMover = {
  symbol: string;
  company_name: string;
  close: number;
  pct_change: number;
  volume_ratio: number | null;
};

export type MarketMovers = {
  trade_date: string;
  gainers: MarketMover[];
  losers: MarketMover[];
  volume_surge: MarketMover[];
};

export async function getMarketMovers(): Promise<MarketMovers | null> {
  if (shouldUseMockFallback()) return mockMarketMovers();
  const res = await fetch(`${API}/api/v1/market/movers`, { headers: publicHeaders });
  if (!res.ok) return null;
  return res.json();
}

export type SectorBreadthItem = {
  sector: string;
  total: number;
  advances: number;
  declines: number;
  unchanged: number;
  ad_ratio: number | null;
  above_ema200_pct: number | null;
};

export async function getSectorBreadth(): Promise<{ trade_date: string; sectors: SectorBreadthItem[] } | null> {
  if (shouldUseMockFallback()) return mockSectorBreadth();
  const res = await fetch(`${API}/api/v1/market/sector-breadth`, { headers: publicHeaders });
  if (!res.ok) return null;
  return res.json();
}

export async function getSectors(): Promise<string[]> {
  if (shouldUseMockFallback()) return mockSectorBreadth().sectors.map((s) => s.sector);
  const res = await fetch(`${API}/api/v1/market/sectors`, { headers: publicHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return data.sectors ?? [];
}

export async function searchSymbols(q: string): Promise<SymbolSearchResult[]> {
  if (shouldUseMockFallback()) return mockSearchSymbols(q);
  try {
    const res = await fetch(`${API}/api/v1/charts/search?q=${encodeURIComponent(q)}`, { headers: publicHeaders });
    if (!res.ok) return shouldUseMockFallback() ? mockSearchSymbols(q) : [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return shouldUseMockFallback() ? mockSearchSymbols(q) : [];
  }
}

export async function getDrawings(symbol: string, timeframe = "D"): Promise<Drawing[]> {
  if (shouldUseMockFallback()) return [];
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings?timeframe=${timeframe}`, { headers });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getChartWorkspace(symbol: string, timeframe = "D"): Promise<ChartWorkspace> {
  if (shouldUseMockFallback()) return { symbol, timeframe, indicators: [], drawings: [] };
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${symbol}/workspace?timeframe=${timeframe}`, { headers });
    if (!res.ok) return { symbol, timeframe, indicators: [], drawings: [] };
    return res.json();
  } catch {
    return { symbol, timeframe, indicators: [], drawings: [] };
  }
}

export async function saveChartWorkspace(symbol: string, workspace: Omit<ChartWorkspace, "symbol">): Promise<ChartWorkspace> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/workspace`, {
    method: "POST",
    headers,
    body: JSON.stringify(workspace),
  });
  if (!res.ok) throw new Error("Save chart workspace failed");
  return res.json();
}

export async function saveDrawing(
  symbol: string,
  drawing: { tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe: string }
): Promise<Drawing> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings`, {
    method: "POST",
    headers,
    body: JSON.stringify(drawing),
  });
  if (!res.ok) throw new Error("Save drawing failed");
  return res.json();
}

export async function updateDrawing(
  symbol: string,
  drawingId: string,
  drawing: { tool_type: string; points: unknown[]; style: Record<string, unknown>; timeframe: string }
): Promise<Drawing> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings/${drawingId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(drawing),
  });
  if (!res.ok) throw new Error("Update drawing failed");
  return res.json();
}

export async function deleteDrawing(symbol: string, drawingId: string): Promise<void> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings/${drawingId}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok && res.status !== 404) {
      console.warn("deleteDrawing failed:", res.status);
    }
  } catch (e) {
    // Network error — drawing state is local, so silently skip
    console.warn("deleteDrawing network error:", e);
  }
}

export async function getChartLayout(symbol: string): Promise<ChartLayout> {
  if (shouldUseMockFallback()) return { symbol, timeframe: "D", indicators: [], drawing_tools: [] };
  const normalizeLayoutIndicators = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object" || !("type" in item)) return [];
      const raw = item as { type?: string; params?: { period?: unknown } };
      if (raw.type === "ema") return [`ema${raw.params?.period ?? 20}`];
      if (raw.type === "vwap" || raw.type === "rsi" || raw.type === "macd" || raw.type === "volume") return [raw.type];
      return [];
    });
  };
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/charts/${symbol}/layout`, { headers });
    if (res?.ok) {
      const layout: ChartLayout = await res.json();
      layout.indicators = normalizeLayoutIndicators(layout.indicators);
      if (layout.indicators?.length || layout.drawing_tools?.length || layout.timeframe !== "D") return layout;
    }
    const defaultRes = await fetch(`${API}/api/v1/charts/__DEFAULT__/layout`, { headers });
    if (defaultRes.ok) {
      const fallback: ChartLayout = await defaultRes.json();
      fallback.indicators = normalizeLayoutIndicators(fallback.indicators);
      return { ...fallback, symbol, drawing_tools: [] };
    }
    return { symbol, timeframe: "D", indicators: [], drawing_tools: [] };
  } catch {
    return { symbol, timeframe: "D", indicators: [], drawing_tools: [] };
  }
}

export async function saveChartLayout(symbol: string, layout: Omit<ChartLayout, "symbol">): Promise<ChartLayout> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/layout`, {
    method: "POST",
    headers,
    body: JSON.stringify(layout),
  });
  if (!res.ok) throw new Error("Save layout failed");
  return res.json();
}

export async function saveDefaultChartLayout(layout: Omit<ChartLayout, "symbol">): Promise<ChartLayout> {
  return saveChartLayout("__DEFAULT__", { ...layout, drawing_tools: [] });
}

// ── Journal ───────────────────────────────────────────────────────────────────

export type JournalEntry = {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string | null;
  trade_type: "long" | "short";
  setup_type: string | null;
  entry_date: string;
  entry_price: number;
  quantity: number;
  exit_date: string | null;
  exit_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  holding_days: number | null;
  stop_loss: number | null;
  target_price: number | null;
  risk_reward: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  mistakes: string | null;
  lessons: string | null;
  status: "open" | "closed" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type JournalStats = {
  total_trades: number;
  open_trades: number;
  total_pnl: number;
  win_rate: number;
  avg_pnl: number;
  avg_win: number;
  avg_loss: number;
  best_trade: number;
  worst_trade: number;
  avg_holding_days: number;
};

export type CreateJournalEntry = {
  symbol: string;
  trade_type: "long" | "short";
  entry_date: string;
  entry_price: number;
  quantity: number;
  setup_type?: string;
  stop_loss?: number;
  target_price?: number;
  entry_reason?: string;
};

export type UpdateJournalEntry = {
  exit_date?: string;
  exit_price?: number;
  exit_reason?: string;
  mistakes?: string;
  lessons?: string;
  stop_loss?: number | null;
  target_price?: number | null;
  setup_type?: string;
  entry_reason?: string;
  status?: string;
};

export async function getJournalEntries(
  params?: { limit?: number; offset?: number; status?: string; symbol?: string }
): Promise<{ entries: JournalEntry[]; total: number; plan?: string; history_months?: number | null }> {
  if (shouldUseMockFallback()) return mockJournalEntries();
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  if (params?.symbol) qs.set("symbol", params.symbol);
  const cacheKey = `journal:entries:${qs.toString()}`;
  return cachedClientRequest(cacheKey, 20_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal?${qs}`, { headers });
    if (!res.ok) return { entries: [], total: 0 };
    return res.json();
  });
}

export async function getJournalStats(): Promise<JournalStats> {
  if (shouldUseMockFallback()) return mockJournalStats();
  return cachedClientRequest("journal:stats", 30_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal/stats`, { headers });
    if (!res.ok) return {
      total_trades: 0, open_trades: 0, total_pnl: 0, win_rate: 0,
      avg_pnl: 0, avg_win: 0, avg_loss: 0, best_trade: 0, worst_trade: 0, avg_holding_days: 0,
    };
    return res.json();
  });
}

export async function createJournalEntry(entry: CreateJournalEntry): Promise<JournalEntry> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal`, {
    method: "POST",
    headers,
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const created = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return created;
}

export async function updateJournalEntry(id: string, update: UpdateJournalEntry): Promise<JournalEntry> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const updated = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return updated;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/journal/${id}`, { method: "DELETE", headers });
  invalidateClientCache(["journal:", "portfolio"]);
}

export type JournalAnalytics = {
  equity_curve: { date: string; cumulative_pnl: number }[];
  setup_breakdown: {
    setup: string;
    trades: number;
    wins: number;
    win_rate: number;
    total_pnl: number;
    avg_pnl: number;
  }[];
  monthly_pnl: { month: string; pnl: number }[];
  drawdown_curve: { date: string; drawdown: number; drawdown_pct: number }[];
  max_drawdown: number | null;
  longest_dd_days: number;
  recovery_factor: number | null;
  profit_factor: number | null;
};

export async function getJournalAnalytics(): Promise<JournalAnalytics> {
  if (shouldUseMockFallback()) return mockJournalAnalytics();
  return cachedClientRequest("journal:analytics", 30_000, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${API}/api/v1/journal/analytics`, { headers });
    if (!res.ok) return { equity_curve: [], setup_breakdown: [], monthly_pnl: [], drawdown_curve: [], max_drawdown: null, longest_dd_days: 0, recovery_factor: null, profit_factor: null };
    return res.json();
  });
}

// ── Fundamentals ──────────────────────────────────────────────────────────────

export type Fundamentals = {
  symbol: string;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  dividend_yield: number | null;
  trailing_eps: number | null;
  forward_eps: number | null;
  earnings_growth: number | null;
  revenue_growth: number | null;
  return_on_equity: number | null;
  debt_to_equity: number | null;
  market_cap: number | null;
  market_cap_str: string | null;
};

export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const res = await fetch(`${API}/api/v1/stocks/${symbol}/fundamentals`);
  if (!res.ok) return null;
  return res.json();
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type PlanStatus = {
  plan: string;
  expires_at: string | null;
  active: boolean;
};

export type PaymentConfig = {
  gateway: "razorpay";
  configured: boolean;
  mode: "live" | "test" | "disabled";
  key_prefix: string;
  founder_plan_available: boolean;
};

export async function getPaymentConfig(): Promise<PaymentConfig> {
  try {
    const res = await fetch(`${API}/api/v1/payments/config`, { headers: publicHeaders });
    if (!res.ok) throw new Error("Payment config unavailable");
    return res.json();
  } catch {
    return { gateway: "razorpay", configured: false, mode: "disabled", key_prefix: "", founder_plan_available: false };
  }
}

export async function getPlanStatus(): Promise<PlanStatus> {
  if (shouldUseMockFallback()) return { plan: "free", expires_at: null, active: false };
  return cachedClientRequest("payments:status", 60_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/payments/status`, { headers });
      if (!res.ok) return { plan: "free", expires_at: null, active: false };
      return res.json();
    } catch {
      return { plan: "free", expires_at: null, active: false };
    }
  });
}

export async function createPaymentOrder(
  plan: "pro" | "elite",
  currency: "INR" | "USD" = "INR",
  billing: "monthly" | "annual" = "monthly",
): Promise<{
  order_id: string;
  amount: number;
  currency: string;
  plan: string;
  billing: string;
  label: string;
}> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/create-order`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan, currency, billing }),
  });
  if (!res.ok) throw new Error("Failed to create payment order");
  return res.json();
}

export async function verifyPayment(data: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: string;
  currency?: string;
  billing?: string;
}): Promise<{ status: string; plan: string; expires_at: string; currency?: string; billing?: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Payment verification failed");
  return res.json();
}

export async function applyFounderPlan(code: string): Promise<{ status: string; plan: string; expires_at: string; billing: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/founder/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Founder code failed" }));
    throw new Error(body.detail ?? "Founder code failed");
  }
  return res.json();
}

export type PlanPrice = {
  plan: "pro" | "elite";
  currency: "INR" | "USD";
  amount: number;          // smallest unit (paise/cents)
  amount_display: number;  // whole currency
  label: string;
  days: number;
};

export async function getPlanPrices(currency: "INR" | "USD" = "INR"): Promise<PlanPrice[]> {
  const res = await fetch(`${API}/api/v1/payments/plans?currency=${currency}`, { headers: publicHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return data.plans ?? [];
}

export async function analyseJournal(): Promise<{ analysis: string; trades_analysed: number; disclaimer?: string }> {
  if (shouldUseMockFallback()) {
    return {
      analysis: "Your strongest trades came from planned breakout and pullback setups. Keep position sizing consistent, journal the invalidation level before entry, and avoid adding risk after the first failed confirmation.",
      trades_analysed: 24,
      disclaimer: "Mock trade review for local demo mode.",
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/ai/analyse`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(typeof body.detail === "string" ? body.detail : "Trade review failed");
  }
  return res.json();
}

// ── Scan Alerts ───────────────────────────────────────────────────────────────

export type ScanAlert = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort_by: string;
  sort_order: string;
  is_active: boolean;
  last_run_at: string | null;
  last_match_count: number | null;
  created_at: string;
};

export type ScanAlertMatch = {
  id: string;
  alert_id: string;
  run_date: string;
  symbols: Array<{
    symbol: string;
    close: number;
    pct_change: number | null;
    volume_ratio: number | null;
    rsi_14: number | null;
  }>;
  match_count: number;
  scan_alerts?: { name: string };
};

export async function listAlerts(): Promise<ScanAlert[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts`, { headers });
  if (!res.ok) throw new Error("Failed to load alerts");
  const data = await res.json();
  return data.alerts;
}

export async function createAlert(body: {
  name: string;
  filters: Record<string, unknown>;
  sort_by?: string;
  sort_order?: string;
}): Promise<ScanAlert> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to create alert");
  }
  return res.json();
}

export async function updateAlert(id: string, body: {
  name?: string;
  is_active?: boolean;
  filters?: Record<string, unknown>;
}): Promise<ScanAlert> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update alert");
  return res.json();
}

export async function deleteAlert(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/alerts/${id}`, { method: "DELETE", headers });
}

export async function getAlertMatches(alertId: string): Promise<ScanAlertMatch[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/${alertId}/matches`, { headers });
  if (!res.ok) throw new Error("Failed to load matches");
  const data = await res.json();
  return data.matches;
}

export async function getRecentAlertMatches(): Promise<ScanAlertMatch[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/alerts/recent/matches`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.matches;
}

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: string;
  plan_expires_at: string | null;
  onboarding_completed: boolean;
  telegram_chat_id: string | null;
  broker_type: string | null;
  broker_api_key: string | null;   // masked — last 4 chars only
  broker_connected_at: string | null;
  billing_region?: string;         // "IN" | "NRI" | "US" | "INTL"
  billing_currency?: string;       // "INR" | "USD"
  created_at: string;
};

export async function getMe(): Promise<UserProfile> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/me`, { headers });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function updateMe(updates: {
  full_name?: string;
  onboarding_completed?: boolean;
  telegram_chat_id?: string;
  broker_type?: string;
  broker_api_key?: string;
  broker_api_secret?: string;
  billing_region?: string;
  billing_currency?: string;
}): Promise<UserProfile> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/me`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to update profile");
  }
  return res.json();
}

export async function getZerodhaLoginUrl(): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/zerodha/login`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to get login URL");
  }
  const data = await res.json();
  return data.login_url;
}

export async function connectZerodha(requestToken: string): Promise<{ status: string; message: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/zerodha/callback?request_token=${encodeURIComponent(requestToken)}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Zerodha connection failed");
  }
  return res.json();
}

// ── Orders / Broker ───────────────────────────────────────────────────────────

export type PlaceOrderRequest = {
  symbol:       string;
  side:         "buy" | "sell";
  quantity:     number;
  price:        number;
  order_type?:  "market" | "limit";
  stop_loss?:   number;
  target_price?: number;
  setup_type?:  string;
  notes?:       string;
  source_page?: "chart" | "watchlist" | "scanner" | "manual";
  source_context?: string;
};

export type OrderResult = {
  status:           string;
  message:          string;
  journal_id:       string | null;
  symbol:           string;
  side:             string;
  quantity:         number;
  price:            number;
  broker:           string;          // "simulated" | "zerodha" | "upstox"
  broker_order_id:  string | null;
  execution_mode?:  string;
  journal_status?:  string;
  risk_reward?:     number | null;
  next_actions?:    string[];
};

export async function closePosition(
  journalId: string,
  exitPrice: number,
  exitReason?: string
): Promise<{ status: string; pnl: number; pnl_pct: number; message: string; lesson_generated?: boolean; review_tip?: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/orders/close`, {
    method: "POST",
    headers,
    body: JSON.stringify({ journal_id: journalId, exit_price: exitPrice, exit_reason: exitReason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? `Close failed (${res.status})`);
  }
  const closed = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return closed;
}

export async function importZerodhaTrades(): Promise<{
  imported: number; skipped: number; total_filled_orders: number; message: string
}> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/broker/zerodha/import`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? "Import failed");
  }
  const imported = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return imported;
}

export async function getBrokerStatus(): Promise<{
  connected: boolean;
  broker: string | null;
  mode: string;
  has_api_key: boolean;
  has_token: boolean;
  token_expired: boolean;
  connected_at: string | null;
  token_expires_at: string | null;
}> {
  if (shouldUseMockFallback()) {
    return {
      connected: false,
      broker: null,
      mode: "simulated",
      has_api_key: false,
      has_token: false,
      token_expired: false,
      connected_at: null,
      token_expires_at: null,
    };
  }
  return cachedClientRequest("broker:status", 20_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/broker/status`, { headers });
      if (!res.ok) {
        return {
          connected: false,
          broker: null,
          mode: "simulated",
          has_api_key: false,
          has_token: false,
          token_expired: false,
          connected_at: null,
          token_expires_at: null,
        };
      }
      return res.json();
    } catch {
      return {
        connected: false,
        broker: null,
        mode: "simulated",
        has_api_key: false,
        has_token: false,
        token_expired: false,
        connected_at: null,
        token_expires_at: null,
      };
    }
  });
}

export type DataHealth = {
  status: "healthy" | "degraded" | "stale";
  latest_trade_date: string | null;
  hours_since_refresh: number | null;
  symbols_on_latest_date: number | null;
  universe_active: number | null;
  coverage_pct?: number | null;
  mode?: "live" | "eod" | "fallback" | "unknown";
  message?: string;
  indicators_missing: {
    rsi_14: number | null;
    ema_200: number | null;
  };
  last_run: {
    id: string | null;
    errors: number | null;
  };
};

let dataHealthCache: { value: DataHealth | null; expiresAt: number } | null = null;
let dataHealthPromise: Promise<DataHealth | null> | null = null;

export async function getDataHealth(): Promise<DataHealth | null> {
  const now = Date.now();
  if (dataHealthCache && dataHealthCache.expiresAt > now) return dataHealthCache.value;
  if (dataHealthPromise) return dataHealthPromise;

  dataHealthPromise = (async () => {
    try {
      const res = await fetch(`${API}/api/v1/data/health`, { headers: publicHeaders });
      if (!res.ok) {
        dataHealthCache = { value: null, expiresAt: Date.now() + 15_000 };
        return null;
      }
      const value = await res.json();
      dataHealthCache = { value, expiresAt: Date.now() + 60_000 };
      return value;
    } finally {
      dataHealthPromise = null;
    }
  })();

  return dataHealthPromise;
}

export type AiPatterns = {
  ready: boolean;
  total_trades?: number;
  min_trades_required?: number;
  trades_available?: number;
  avg_hold_winners?: number | null;
  avg_hold_losers?: number | null;
  day_of_week?: { day: string; trades: number; wins: number; win_rate: number; total_pnl: number }[];
  by_direction?: { direction: string; trades: number; wins: number; win_rate: number; total_pnl: number }[];
  by_holding_period?: { bucket: string; trades: number; wins: number; win_rate: number }[];
};

export async function getAiPatterns(): Promise<AiPatterns> {
  if (shouldUseMockFallback()) {
    return {
      ready: true,
      total_trades: 24,
      trades_available: 24,
      min_trades_required: 10,
      avg_hold_winners: 8,
      avg_hold_losers: 4,
      by_direction: [
        { direction: "long", trades: 18, wins: 12, win_rate: 66.7, total_pnl: 58400 },
        { direction: "short", trades: 6, wins: 3, win_rate: 50, total_pnl: 10020 },
      ],
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/ai/patterns`, { headers });
  if (!res.ok) return { ready: false };
  return res.json();
}

export async function triggerTradeLesson(entryId: string): Promise<JournalEntry> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal/${entryId}/lessons`, { method: "POST", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? "Trade lesson generation failed");
  }
  return res.json();
}

export async function placeOrder(order: PlaceOrderRequest): Promise<OrderResult> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(order),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? `Order failed (${res.status})`);
  }
  const result = await res.json();
  invalidateClientCache(["journal:", "portfolio"]);
  return result;
}

// ── Live candles (Yahoo Finance, no DB) ──────────────────────────────────────

export async function getCandlesLive(
  symbol: string,
  params?: { limit?: number; timeframe?: string }
): Promise<CandlesResponse> {
  if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.timeframe) qs.set("timeframe", params.timeframe);
  try {
    const res = await fetch(`${API}/api/v1/charts/${symbol}/candles-live?${qs}`, { headers: publicHeaders });
    if (!res.ok) {
      if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
      throw new Error(`No live data for ${symbol}`);
    }
    return res.json();
  } catch (error) {
    if (shouldUseMockFallback()) return mockCandles(symbol, params?.timeframe, params?.limit);
    throw error;
  }
}

// ── Price alerts ─────────────────────────────────────────────────────────────

export type PriceAlert = {
  id: string;
  symbol: string;
  condition: "above" | "below";
  target_price: number;
  note: string | null;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
};

export async function getPriceAlerts(): Promise<PriceAlert[]> {
  if (shouldUseMockFallback()) return mockPriceAlerts();
  return cachedClientRequest("price-alerts", 20_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/price-alerts`, { headers });
      if (!res.ok) return shouldUseMockFallback() ? mockPriceAlerts() : [];
      const d = await res.json();
      return d.alerts ?? [];
    } catch {
      return shouldUseMockFallback() ? mockPriceAlerts() : [];
    }
  });
}

export async function createPriceAlert(
  payload: { symbol: string; condition: "above" | "below"; target_price: number; note?: string }
): Promise<PriceAlert> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/price-alerts`, {
    method: "POST", headers, body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(b.detail ?? "Failed to create alert");
  }
  const created = await res.json();
  invalidateClientCache(["price-alerts"]);
  return created;
}

export async function deletePriceAlert(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/price-alerts/${id}`, { method: "DELETE", headers });
  invalidateClientCache(["price-alerts"]);
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export type PortfolioPosition = {
  id: string;
  symbol: string;
  company_name: string | null;
  trade_type: "long" | "short";
  entry_date: string;
  entry_price: number;
  quantity: number;
  stop_loss: number | null;
  target_price: number | null;
  setup_type: string | null;
  current_price: number;
  day_change_pct: number | null;
  unrealised_pnl: number;
  unrealised_pnl_pct: number;
  invested: number;
  sector: string | null;
};

export type PortfolioResponse = {
  positions: PortfolioPosition[];
  summary: {
    total_invested: number;
    total_current: number;
    total_pnl: number;
    total_pnl_pct: number;
    open_count: number;
  };
  sectors: { sector: string; pnl: number }[];
};

export async function getPortfolio(): Promise<PortfolioResponse> {
  if (shouldUseMockFallback()) return mockPortfolio();
  return cachedClientRequest("portfolio", 20_000, async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API}/api/v1/journal/portfolio`, { headers });
      if (!res.ok) {
        if (shouldUseMockFallback()) return mockPortfolio();
        throw new Error("Failed to load portfolio");
      }
      return res.json();
    } catch (error) {
      if (shouldUseMockFallback()) return mockPortfolio();
      throw error;
    }
  });
}

// ── Backtest ──────────────────────────────────────────────────────────────────

export type BacktestResult = {
  date: string;
  match_count: number;
  top_symbols: string[];
};

export type BacktestResponse = {
  days_analysed: number;
  avg_matches: number;
  max_matches: number;
  min_matches: number;
  results: BacktestResult[];
};

export async function runBacktest(
  filters: ScanFilters,
  days = 30,
): Promise<BacktestResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/backtest/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filters, days }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? `Backtest failed (${res.status})`);
  }
  return res.json();
}

// ── Referral ──────────────────────────────────────────────────────────────────

export async function getReferralCode(): Promise<{ referral_code: string; referral_url: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/referral-code`, { headers });
  if (!res.ok) throw new Error("Failed to get referral code");
  return res.json();
}

export async function applyReferral(code: string): Promise<{ status: string; message: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/referral/apply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ referral_code: code }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(body.detail ?? "Failed to apply referral");
  }
  return res.json();
}

// ── Community shared screens ──────────────────────────────────────────────────

export type SharedScreen = {
  id: string;
  user_id: string;
  screen_id: string;
  title: string;
  description: string | null;
  tags: string[];
  upvotes: number;
  is_featured: boolean;
  created_at: string;
};

export async function getSharedScreens(limit = 20): Promise<SharedScreen[]> {
  const res = await fetch(`${API}/api/v1/community/screens?limit=${limit}`, { headers: publicHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return data.screens ?? [];
}

export async function shareScreen(screenId: string, title: string, description?: string, tags?: string[]): Promise<SharedScreen> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/community/screens`, {
    method: "POST",
    headers,
    body: JSON.stringify({ screen_id: screenId, title, description, tags: tags ?? [] }),
  });
  if (!res.ok) throw new Error("Failed to share screen");
  return res.json();
}

export async function upvoteScreen(sharedScreenId: string): Promise<{ upvotes: number }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/community/screens/${sharedScreenId}/upvote`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Upvote failed");
  return res.json();
}

// ── Annual plan helpers ───────────────────────────────────────────────────────

export async function createPaymentOrderFull(
  plan: "pro" | "elite",
  currency: "INR" | "USD" = "INR",
  billing: "monthly" | "annual" = "monthly",
): Promise<{ order_id: string; amount: number; currency: string; plan: string; billing: string; label: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/create-order`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan, currency, billing }),
  });
  if (!res.ok) throw new Error("Failed to create payment order");
  return res.json();
}

// ── Market overview ───────────────────────────────────────────────────────────

export interface MarketOverview {
  trade_date: string | null;
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  advance_decline_ratio: number;
  new_52w_highs: number;
  new_52w_lows: number;
  above_ema20_pct: number;
  above_ema50_pct: number;
  above_ema200_pct: number;
  market_phase: string;
  market_phase_desc: string;
  indices?: { symbol: string; label: string; close: number | null; pct_change: number | null; prev_close: number | null; source: string; error?: string }[];
  top_sectors?: { sector: string; total: number; advances: number; declines: number; avg_pct_change: number; breadth_pct: number }[];
  market_data_source?: string;
  is_live?: boolean;
  sector_breadth: { sector: string; total: number; advances: number; declines: number; avg_pct_change: number; breadth_pct: number }[];
  top_gainers: { symbol: string; company_name: string; close: number; pct_change: number; volume_ratio: number | null }[];
  top_losers:  { symbol: string; company_name: string; close: number; pct_change: number; volume_ratio: number | null }[];
  most_active: { symbol: string; company_name: string; close: number; pct_change: number; volume_ratio: number | null }[];
  as_of?: string | null;
  generated_at?: string | null;
  cache_status?: "hit" | "miss" | string;
}

function numberOr(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeMarketOverview(raw: Partial<MarketOverview> | null | undefined): MarketOverview {
  const data = raw ?? {};
  return {
    trade_date: data.trade_date ?? null,
    advances: numberOr(data.advances),
    declines: numberOr(data.declines),
    unchanged: numberOr(data.unchanged),
    total: numberOr(data.total),
    advance_decline_ratio: numberOr(data.advance_decline_ratio),
    new_52w_highs: numberOr(data.new_52w_highs),
    new_52w_lows: numberOr(data.new_52w_lows),
    above_ema20_pct: numberOr(data.above_ema20_pct),
    above_ema50_pct: numberOr(data.above_ema50_pct),
    above_ema200_pct: numberOr(data.above_ema200_pct),
    market_phase: data.market_phase ?? "Pending",
    market_phase_desc: data.market_phase_desc ?? "Market breadth will appear after the latest complete trading day is available.",
    indices: Array.isArray(data.indices) ? data.indices.map((idx) => ({
      ...idx,
      close: idx.close == null ? null : numberOr(idx.close, NaN),
      pct_change: idx.pct_change == null ? null : numberOr(idx.pct_change, NaN),
      prev_close: idx.prev_close == null ? null : numberOr(idx.prev_close, NaN),
    })).map((idx) => ({
      ...idx,
      close: Number.isFinite(idx.close) ? idx.close : null,
      pct_change: Number.isFinite(idx.pct_change) ? idx.pct_change : null,
      prev_close: Number.isFinite(idx.prev_close) ? idx.prev_close : null,
    })) : [],
    top_sectors: Array.isArray(data.top_sectors) ? data.top_sectors : [],
    market_data_source: data.market_data_source,
    is_live: Boolean(data.is_live),
    sector_breadth: Array.isArray(data.sector_breadth) ? data.sector_breadth : [],
    top_gainers: Array.isArray(data.top_gainers) ? data.top_gainers : [],
    top_losers: Array.isArray(data.top_losers) ? data.top_losers : [],
    most_active: Array.isArray(data.most_active) ? data.most_active : [],
    as_of: data.as_of ?? data.trade_date ?? null,
    generated_at: data.generated_at ?? null,
    cache_status: data.cache_status,
  };
}

let marketOverviewCache: { value: MarketOverview; expiresAt: number } | null = null;
let marketOverviewPromise: Promise<MarketOverview> | null = null;

export async function getMarketOverview(): Promise<MarketOverview> {
  if (shouldUseMockFallback()) return mockMarketOverview();
  const now = Date.now();
  if (marketOverviewCache && marketOverviewCache.expiresAt > now) return marketOverviewCache.value;
  if (marketOverviewPromise) return marketOverviewPromise;

  marketOverviewPromise = (async () => {
    const headers = await authHeaders();
    // Try new comprehensive endpoint first; fall back to legacy summary if not deployed yet
    const res = await withTimeout(fetch(`${API}/api/v1/market/overview`, { headers }), 2500).catch(() => null);
    if (res?.ok) {
      const value = normalizeMarketOverview(await res.json());
      marketOverviewCache = { value, expiresAt: Date.now() + 45_000 };
      return value;
    }

    // Legacy fallback: compose from public endpoints so dashboard still renders
    // sector and EMA breadth if the authenticated overview endpoint is blocked.
    const [legacyRes, sectorRes, moversRes] = await Promise.all([
      fetch(`${API}/api/v1/market/summary`, { headers: publicHeaders }),
      getSectorBreadth().catch(() => null),
      getMarketMovers().catch(() => null),
    ]);
    if (!legacyRes.ok) throw new Error("Failed to fetch market overview");
    const s: MarketSummary = await legacyRes.json();

    const total = s.total_stocks ?? (s.advances + s.declines + s.unchanged);
    const ema200 = s.above_ema200_pct ?? 0;
    const phase = ema200 >= 60 ? "Bullish" : ema200 <= 40 ? "Bearish" : "Neutral";
    const phaseDesc = ema200 >= 60
      ? `Strong breadth — ${s.above_ema20_pct ?? "?"}% above EMA 20`
      : ema200 <= 40
        ? `Weak breadth — only ${ema200}% above EMA 200`
        : `Mixed market — ${ema200}% above EMA 200`;

    const value = normalizeMarketOverview({
      trade_date: s.trade_date,
      advances: s.advances,
      declines: s.declines,
      unchanged: s.unchanged,
      total,
      advance_decline_ratio: s.advance_decline_ratio ?? 0,
      new_52w_highs: s.new_52w_highs,
      new_52w_lows: s.new_52w_lows,
      above_ema20_pct: s.above_ema20_pct ?? 0,
      above_ema50_pct: s.above_ema50_pct ?? 0,
      above_ema200_pct: ema200,
      market_phase: phase,
      market_phase_desc: phaseDesc,
      sector_breadth: (sectorRes?.sectors ?? []).map((sector) => ({
        sector: sector.sector,
        total: sector.total,
        advances: sector.advances,
        declines: sector.declines,
        avg_pct_change: 0,
        breadth_pct: sector.total ? Number(((sector.advances / sector.total) * 100).toFixed(1)) : 0,
      })),
      top_sectors: (sectorRes?.sectors ?? []).slice(0, 5).map((sector) => ({
        sector: sector.sector,
        total: sector.total,
        advances: sector.advances,
        declines: sector.declines,
        avg_pct_change: 0,
        breadth_pct: sector.total ? Number(((sector.advances / sector.total) * 100).toFixed(1)) : 0,
      })),
      top_gainers: moversRes?.gainers ?? [],
      top_losers: moversRes?.losers ?? [],
      most_active: moversRes?.volume_surge ?? [],
    });
    marketOverviewCache = { value, expiresAt: Date.now() + 45_000 };
    return value;
  })().finally(() => {
    marketOverviewPromise = null;
  });

  return marketOverviewPromise;
}

export type MarketSnapshot = {
  overview: MarketOverview;
  health: DataHealth | null;
  asOf: string | null;
  mode: DataHealth["mode"] | "live" | "eod" | "fallback" | "unknown";
  source: string;
  generatedAt: string;
  cacheStatus: string;
};

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  return cachedClientRequest("market-snapshot", 30_000, async () => {
    const [overview, health] = await Promise.all([
      getMarketOverview(),
      getDataHealth().catch(() => null),
    ]);
    return {
      overview,
      health,
      asOf: overview.as_of ?? overview.trade_date ?? health?.latest_trade_date ?? null,
      mode: overview.is_live ? "live" : health?.mode ?? "eod",
      source: overview.market_data_source ?? "AlphaVyuh market snapshot",
      generatedAt: overview.generated_at ?? new Date().toISOString(),
      cacheStatus: overview.cache_status ?? "client",
    };
  });
}

export function warmCoreMarketData() {
  void getMarketSnapshot().catch(() => null);
  void getWatchlists().catch(() => null);
  void getJournalEntries({ limit: 75 }).catch(() => null);
  void getJournalStats().catch(() => null);
  void getBrokerStatus().catch(() => null);
  void getPlanStatus().catch(() => null);
  void getPriceAlerts().catch(() => null);
  void getPortfolio().catch(() => null);
}

export type WaitlistLead = {
  id: string;
  email: string;
  source: string;
  invite_code: string | null;
  status: string;
  created_at: string;
};

export async function getAdminWaitlist(): Promise<WaitlistLead[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/waitlist/admin`, { headers });
  if (!res.ok) throw new Error("Admin waitlist unavailable");
  const data = await res.json();
  return data.waitlist ?? [];
}

export async function createInviteCode(payload: { email?: string; max_uses?: number; plan?: string }): Promise<{ code: string; email?: string | null; max_uses: number; uses: number; plan: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/invite-codes`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Could not create invite code");
  return res.json();
}

export type FeedbackReport = {
  id: string;
  user_id: string | null;
  category: "general" | "bug" | "data_issue" | "feature_request";
  page: string | null;
  symbol: string | null;
  severity: "low" | "normal" | "high";
  message: string;
  context: Record<string, unknown>;
  status: "new" | "triaged" | "resolved" | "closed";
  created_at: string;
};

export async function createFeedbackReport(payload: {
  category?: FeedbackReport["category"];
  page?: string | null;
  symbol?: string | null;
  severity?: FeedbackReport["severity"];
  message: string;
  context?: Record<string, unknown>;
}): Promise<FeedbackReport> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Could not send feedback");
  const data = await res.json();
  return data.feedback;
}

export async function getAdminFeedback(): Promise<FeedbackReport[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/feedback/admin`, { headers });
  if (!res.ok) throw new Error("Admin feedback unavailable");
  const data = await res.json();
  return data.feedback ?? [];
}

export async function updateAdminFeedbackStatus(id: string, status: FeedbackReport["status"]): Promise<FeedbackReport> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/feedback/admin/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Could not update feedback");
  const data = await res.json();
  return data.feedback;
}

// ── Scanner presets ───────────────────────────────────────────────────────────

export interface ScanPreset {
  id: string;
  name: string;
  description: string;
  color: string;
  filters: Record<string, unknown>;
}

export async function getScannerPresets(): Promise<ScanPreset[]> {
  const res = await fetch(`${API}/api/v1/scanner/presets`);
  if (!res.ok) return [];
  return res.json();
}

export async function runScanner(filters: Record<string, unknown>, sort_by = "volume_ratio", sort_order = "desc"): Promise<{ trade_date: string; total_matches: number; plan: string; results: ScanResult[] }> {
  if (shouldUseMockFallback()) {
    const data = mockRunScan();
    return {
      trade_date: data.trade_date,
      total_matches: data.total_matches,
      plan: data.plan ?? "mock",
      results: data.results,
    };
  }
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filters, sort_by, sort_order }),
  });
  if (!res.ok) throw new Error("Scanner failed");
  return res.json();
}

// ─── Adapter-backed broker routes (/api/brokers/*) ───────────────────────────

export type BrokerProfile = {
  broker_id: string;
  user_id: string;
  display_name: string;
  email: string;
};

export type BrokerHolding = {
  symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  current_value: number;
  pnl: number;
};

export async function startBrokerConnect(broker: string): Promise<{ auth_url: string; state: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/connect/start`, { method: "POST", headers });
  if (!res.ok) throw new Error("Failed to start broker connect");
  return res.json();
}

export async function getBrokerProfile(broker: string): Promise<BrokerProfile> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/profile`, { headers });
  if (!res.ok) throw new Error("Failed to fetch broker profile");
  return res.json();
}

export async function getBrokerHoldings(broker: string): Promise<BrokerHolding[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/holdings`, { headers });
  if (!res.ok) throw new Error("Failed to fetch broker holdings");
  return res.json();
}

export async function disconnectBroker(broker: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/brokers/${broker}/disconnect`, { method: "DELETE", headers });
  if (!res.ok) throw new Error("Failed to disconnect broker");
}
