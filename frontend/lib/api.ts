import { createClient } from "./supabase";

const API = process.env.NEXT_PUBLIC_API_URL!;

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export type ScanResult = {
  symbol: string;
  company_name: string;
  series: string;
  sector: string | null;
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
  w52l_pct_min?: number;
  new_52w_high?: boolean;
  new_52w_low?: boolean;
  // Market
  series?: string[];
};

export type ScanResponse = {
  trade_date: string;
  total_matches: number;
  plan_limit: number;
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
  sort_order = "desc"
): Promise<ScanResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/scanner/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filters, sort_by, sort_order }),
  });
  if (!res.ok) throw new Error("Scan failed");
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
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.watchlists ?? [];
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/watchlists`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Create failed");
  return res.json();
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
}

export async function removeFromWatchlist(watchlistId: string, symbol: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/watchlists/${watchlistId}/items/${symbol}`, {
    method: "DELETE",
    headers,
  });
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
}

export async function getMarketSummary(): Promise<MarketSummary | null> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/market/summary`, { headers });
  if (!res.ok) return null;
  return res.json();
}

export async function getQuote(symbol: string): Promise<ScanResult | null> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/stocks/${symbol}/quote`, { headers });
  if (!res.ok) return null;
  return res.json();
}

// ── Charts ────────────────────────────────────────────────────────────────────

export type CandleBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export async function getCandles(
  symbol: string,
  params?: { from_date?: string; to_date?: string; limit?: number }
): Promise<CandlesResponse> {
  const headers = await authHeaders();
  const qs = new URLSearchParams();
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API}/api/v1/charts/${symbol}/candles?${qs}`, { headers });
  if (!res.ok) throw new Error(`No data for ${symbol}`);
  return res.json();
}

export async function getIndicators(
  symbol: string,
  indicators: string[]
): Promise<IndicatorsResponse> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API}/api/v1/charts/${symbol}/indicators?indicators=${indicators.join(",")}`,
    { headers }
  );
  if (!res.ok) throw new Error("Indicator fetch failed");
  return res.json();
}

export async function searchSymbols(q: string): Promise<SymbolSearchResult[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/search?q=${encodeURIComponent(q)}`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

export async function getDrawings(symbol: string, timeframe = "D"): Promise<Drawing[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/drawings?timeframe=${timeframe}`, { headers });
  if (!res.ok) return [];
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

export async function deleteDrawing(symbol: string, drawingId: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/charts/${symbol}/drawings/${drawingId}`, {
    method: "DELETE",
    headers,
  });
}

export async function getChartLayout(symbol: string): Promise<ChartLayout> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/charts/${symbol}/layout`, { headers });
  if (!res.ok) return { symbol, timeframe: "D", indicators: [], drawing_tools: [] };
  return res.json();
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
