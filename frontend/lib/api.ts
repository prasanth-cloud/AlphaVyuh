import { createClient } from "./supabase";

const API = process.env.NEXT_PUBLIC_API_URL!;

// Module-level token cache with a ready-promise so callers wait for
// onAuthStateChange(INITIAL_SESSION) instead of racing against it.
let _token: string | null = null;
let _readyResolve: () => void = () => {};
// SSR: resolve immediately (no window, no auth events)
const _ready: Promise<void> =
  typeof window !== "undefined"
    ? new Promise<void>((r) => { _readyResolve = r; })
    : Promise.resolve();

if (typeof window !== "undefined") {
  const _sb = createClient();
  // onAuthStateChange fires synchronously with INITIAL_SESSION on first call
  // if a session is already stored (cookies / localStorage).
  _sb.auth.onAuthStateChange((_event, session) => {
    _token = session?.access_token ?? null;
    _readyResolve(); // unblock any waiting getToken() calls
  });
}

async function getToken(): Promise<string> {
  // Wait for the first onAuthStateChange event (max 4 s to avoid infinite hang)
  await Promise.race([_ready, new Promise<void>((r) => setTimeout(r, 4000))]);

  if (_token) return _token;

  // Fallback: direct session read (handles edge cases where the event never fired)
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    _token = session.access_token;
    return _token;
  }

  // Last resort: force a token refresh
  const { data } = await supabase.auth.refreshSession();
  _token = data.session?.access_token ?? null;
  return _token ?? "";
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getToken();
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// Public endpoints don't need auth — just JSON content-type
const publicHeaders: HeadersInit = { "Content-Type": "application/json" };

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
  const res = await fetch(`${API}/api/v1/scanner/run`, {
    method: "POST",
    headers: publicHeaders,
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
  const res = await fetch(`${API}/api/v1/market/summary`, { headers: publicHeaders });
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
  params?: { from_date?: string; to_date?: string; limit?: number; timeframe?: string }
): Promise<CandlesResponse> {
  const qs = new URLSearchParams();
  if (params?.from_date) qs.set("from_date", params.from_date);
  if (params?.to_date) qs.set("to_date", params.to_date);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.timeframe) qs.set("timeframe", params.timeframe);
  const res = await fetch(`${API}/api/v1/charts/${symbol}/candles?${qs}`, { headers: publicHeaders });
  if (!res.ok) throw new Error(`No data for ${symbol}`);
  return res.json();
}

export async function getIndicators(
  symbol: string,
  indicators: string[],
  timeframe = "D"
): Promise<IndicatorsResponse> {
  const res = await fetch(
    `${API}/api/v1/charts/${symbol}/indicators?indicators=${indicators.join(",")}&timeframe=${timeframe}`,
    { headers: publicHeaders }
  );
  if (!res.ok) throw new Error("Indicator fetch failed");
  return res.json();
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
  const res = await fetch(`${API}/api/v1/market/movers`, { headers: publicHeaders });
  if (!res.ok) return null;
  return res.json();
}

export async function searchSymbols(q: string): Promise<SymbolSearchResult[]> {
  const res = await fetch(`${API}/api/v1/charts/search?q=${encodeURIComponent(q)}`, { headers: publicHeaders });
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
  stop_loss?: number;
  target_price?: number;
  setup_type?: string;
  entry_reason?: string;
  status?: string;
};

export async function getJournalEntries(
  params?: { limit?: number; offset?: number; status?: string; symbol?: string }
): Promise<{ entries: JournalEntry[]; total: number }> {
  const headers = await authHeaders();
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.status) qs.set("status", params.status);
  if (params?.symbol) qs.set("symbol", params.symbol);
  const res = await fetch(`${API}/api/v1/journal?${qs}`, { headers });
  if (!res.ok) return { entries: [], total: 0 };
  return res.json();
}

export async function getJournalStats(): Promise<JournalStats> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal/stats`, { headers });
  if (!res.ok) return {
    total_trades: 0, open_trades: 0, total_pnl: 0, win_rate: 0,
    avg_pnl: 0, avg_win: 0, avg_loss: 0, best_trade: 0, worst_trade: 0, avg_holding_days: 0,
  };
  return res.json();
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
  return res.json();
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
  return res.json();
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const headers = await authHeaders();
  await fetch(`${API}/api/v1/journal/${id}`, { method: "DELETE", headers });
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
};

export async function getJournalAnalytics(): Promise<JournalAnalytics> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/journal/analytics`, { headers });
  if (!res.ok) return { equity_curve: [], setup_breakdown: [], monthly_pnl: [] };
  return res.json();
}

// ── Payments ──────────────────────────────────────────────────────────────────

export type PlanStatus = {
  plan: string;
  expires_at: string | null;
  active: boolean;
};

export async function getPlanStatus(): Promise<PlanStatus> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/status`, { headers });
  if (!res.ok) return { plan: "free", expires_at: null, active: false };
  return res.json();
}

export async function createPaymentOrder(plan: "pro" | "elite"): Promise<{
  order_id: string;
  amount: number;
  currency: string;
  plan: string;
  label: string;
}> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/create-order`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error("Failed to create payment order");
  return res.json();
}

export async function verifyPayment(data: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: string;
}): Promise<{ status: string; plan: string; expires_at: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/api/v1/payments/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Payment verification failed");
  return res.json();
}
