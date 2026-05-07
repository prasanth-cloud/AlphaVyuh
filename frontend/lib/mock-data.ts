import type {
  CandleBar,
  CandlesResponse,
  IndicatorsResponse,
  JournalAnalytics,
  JournalEntry,
  JournalStats,
  LiveQuote,
  MarketMovers,
  MarketOverview,
  MarketSummary,
  PortfolioResponse,
  PriceAlert,
  ScanResponse,
  ScanResult,
  SectorBreadthItem,
  SymbolSearchResult,
  Watchlist,
} from "./api";

const TRADE_DATE = "2026-04-24";

const MOCK_STOCKS: ScanResult[] = [
  stock("RELIANCE", "Reliance Industries", "Energy", 1327.8, -1.16, 11744802, 1.1, 48, 1342, 1376, 1432, 71),
  stock("DIXON", "Dixon Technologies", "Consumer Durables", 14220, 3.18, 891430, 2.4, 68, 13720, 12910, 11440, 91),
  stock("PERSISTENT", "Persistent Systems", "IT Services", 4956, 2.84, 1248330, 1.8, 64, 4820, 4632, 4214, 88),
  stock("DEEPAKNTR", "Deepak Nitrite", "Chemicals", 2847, 4.72, 812440, 2.7, 72, 2710, 2598, 2380, 94),
  stock("CAMS", "Computer Age Management", "Financial Services", 3412, 2.31, 534100, 1.6, 59, 3348, 3210, 3064, 83),
  stock("TCS", "Tata Consultancy Services", "IT Services", 3824, 0.55, 2066130, 0.9, 53, 3792, 3716, 3560, 77),
  stock("HDFCBANK", "HDFC Bank", "Banks", 1714, 0.91, 9218080, 1.2, 55, 1688, 1656, 1604, 79),
  stock("SBIN", "State Bank of India", "Banks", 786, -0.22, 18218802, 0.8, 49, 792, 806, 742, 64),
  stock("AUBANK", "AU Small Finance Bank", "Banks", 694.35, 1.42, 2110840, 1.4, 61, 682, 665, 628, 76),
];

function stock(
  symbol: string,
  company_name: string,
  sector: string,
  close: number,
  pct_change: number,
  volume: number,
  volume_ratio: number,
  rsi: number,
  ema20: number,
  ema50: number,
  ema200: number,
  rs_score: number,
): ScanResult {
  const prev_close = close / (1 + pct_change / 100);
  return {
    symbol,
    company_name,
    series: "EQ",
    sector,
    market: "NSE",
    currency: "INR",
    close,
    prev_close: round(prev_close),
    open: round(prev_close * 1.002),
    high: round(close * 1.014),
    low: round(close * 0.988),
    pct_change,
    gap_pct: round((prev_close * 1.002 - prev_close) / prev_close * 100),
    volume,
    avg_volume_20d: Math.round(volume / volume_ratio),
    volume_ratio,
    turnover: close * volume,
    rsi_14: rsi,
    ema_20: ema20,
    ema_50: ema50,
    ema_200: ema200,
    ema_20_dist: round((close - ema20) / ema20 * 100),
    ema_50_dist: round((close - ema50) / ema50 * 100),
    week_52_high: round(close * 1.12),
    week_52_low: round(close * 0.72),
    week_52_high_pct: round((close * 1.12 - close) / close * 100),
    week_52_low_pct: round((close - close * 0.72) / (close * 0.72) * 100),
    atr_14: round(close * 0.024),
    atr_pct: 2.4,
    turnover_cr: round((close * volume) / 10_000_000),
    macd_hist: pct_change > 0 ? 1.2 : -0.4,
    bb_width: 7.8,
    stoch_k: 64,
    adx_14: 24,
    delivery_pct: 42,
    is_new_52w_high: rs_score >= 90,
    rs_score,
  };
}

export function mockRunScan(): ScanResponse & {
  page: number;
  total_pages: number;
  is_limited: boolean;
} {
  return {
    trade_date: TRADE_DATE,
    total_matches: MOCK_STOCKS.length,
    total_pages: 1,
    page: 1,
    plan_limit: 200,
    plan: "mock",
    is_limited: false,
    mode: "demo",
    source: "AlphaVyuh mock fixtures",
    source_metadata: {
      source_name: "AlphaVyuh mock fixtures",
      mode: "demo",
      as_of: TRADE_DATE,
      confidence: "demo",
      coverage_pct: 100,
      symbols_count: MOCK_STOCKS.length,
      universe_active: MOCK_STOCKS.length,
      license_notes: "Deterministic mock data for workflow QA, not market data.",
    },
    coverage_pct: 100,
    universe_size: MOCK_STOCKS.length,
    results: MOCK_STOCKS,
  };
}

export function mockMarketSummary(): MarketSummary {
  return {
    trade_date: TRADE_DATE,
    advances: 1184,
    declines: 821,
    unchanged: 92,
    advance_decline_ratio: 1.44,
    new_52w_highs: 47,
    new_52w_lows: 12,
    above_ema20_pct: 58,
    above_ema50_pct: 54,
    above_ema200_pct: 63,
    total_stocks: 2097,
  };
}

export function mockMarketOverview(): MarketOverview {
  const summary = mockMarketSummary();
  return {
    trade_date: summary.trade_date,
    advances: summary.advances,
    declines: summary.declines,
    unchanged: summary.unchanged,
    total: summary.total_stocks,
    advance_decline_ratio: summary.advance_decline_ratio ?? 0,
    new_52w_highs: summary.new_52w_highs,
    new_52w_lows: summary.new_52w_lows,
    above_ema20_pct: summary.above_ema20_pct ?? 0,
    above_ema50_pct: 56,
    above_ema200_pct: summary.above_ema200_pct ?? 0,
    market_phase: "Bullish",
    market_phase_desc: "Constructive breadth with leadership above long-term averages",
    sector_breadth: mockSectorBreadth().sectors.map((s) => ({
      sector: s.sector,
      total: s.total,
      advances: s.advances,
      declines: s.declines,
      avg_pct_change: round((s.advances - s.declines) / s.total),
      breadth_pct: s.above_ema200_pct ?? 0,
    })),
    top_gainers: MOCK_STOCKS.filter((s) => (s.pct_change ?? 0) > 0).slice(0, 5).map(toMover),
    top_losers: MOCK_STOCKS.filter((s) => (s.pct_change ?? 0) < 0).slice(0, 5).map(toMover),
    most_active: [...MOCK_STOCKS].sort((a, b) => b.volume - a.volume).slice(0, 5).map(toMover),
    source_metadata: {
      source_name: "AlphaVyuh mock fixtures",
      mode: "demo",
      as_of: TRADE_DATE,
      confidence: "demo",
      coverage_pct: 100,
      symbols_count: MOCK_STOCKS.length,
      universe_active: MOCK_STOCKS.length,
      license_notes: "Deterministic mock data for workflow QA, not market data.",
    },
  };
}

export function mockMarketMovers(): MarketMovers {
  return {
    trade_date: TRADE_DATE,
    gainers: MOCK_STOCKS.filter((s) => (s.pct_change ?? 0) > 0).slice(0, 5).map(toMover),
    losers: MOCK_STOCKS.filter((s) => (s.pct_change ?? 0) < 0).slice(0, 5).map(toMover),
    volume_surge: [...MOCK_STOCKS].sort((a, b) => (b.volume_ratio ?? 0) - (a.volume_ratio ?? 0)).slice(0, 5).map(toMover),
  };
}

export function mockSectorBreadth(): { trade_date: string; sectors: SectorBreadthItem[] } {
  return {
    trade_date: TRADE_DATE,
    sectors: [
      { sector: "IT Services", total: 184, advances: 122, declines: 54, unchanged: 8, ad_ratio: 2.26, above_ema200_pct: 68 },
      { sector: "Banks", total: 96, advances: 51, declines: 41, unchanged: 4, ad_ratio: 1.24, above_ema200_pct: 59 },
      { sector: "Chemicals", total: 142, advances: 88, declines: 47, unchanged: 7, ad_ratio: 1.87, above_ema200_pct: 64 },
    ],
  };
}

export function mockWatchlists(): Watchlist[] {
  return [
    {
      id: "mock-leaders",
      name: "Leaders",
      sort_order: 0,
      created_at: "2026-04-20T09:15:00Z",
      items: MOCK_STOCKS.slice(1, 6).map((s, index) => ({
        symbol: s.symbol,
        sort_order: index,
        added_at: "2026-04-20T09:15:00Z",
        company_name: s.company_name,
        sector: s.sector,
        close: s.close,
        pct_change: s.pct_change,
        volume_ratio: s.volume_ratio,
        rsi_14: s.rsi_14,
        pinned: index === 0,
        tags: index === 0 ? ["breakout"] : [],
        note: index === 0 ? "Watch above prior high with volume." : null,
      })),
    },
  ];
}

export function mockQuote(symbol: string): ScanResult | null {
  const normalized = symbol.trim().toUpperCase();
  const match = MOCK_STOCKS.find((s) => s.symbol === normalized);
  if (match) return match;
  const seed = Array.from(normalized).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const close = 450 + (seed % 1200);
  const pct = ((seed % 41) - 20) / 10;
  return stock(normalized || "UNKNOWN", `${normalized || "Unknown"} demo symbol`, "Demo", close, pct, 500000 + seed * 1000, 1.1, 52 + (seed % 22), close * 0.98, close * 0.95, close * 0.9, 50 + (seed % 35));
}

export function mockLiveQuote(symbol: string): LiveQuote | null {
  const q = mockQuote(symbol);
  if (!q) return null;
  return {
    symbol: q.symbol,
    market: q.market ?? "NSE",
    currency: q.currency ?? "INR",
    close: q.close,
    open: q.open,
    high: q.high,
    low: q.low,
    volume: q.volume,
    prev_close: q.prev_close,
    pct_change: q.pct_change,
    week_52_high: q.week_52_high,
    week_52_low: q.week_52_low,
    source: "mock",
  };
}

export function mockCandles(symbol: string, timeframe = "D", limit = 180): CandlesResponse {
  const q = mockQuote(symbol) ?? MOCK_STOCKS[0];
  const candles = makeCandles(q, timeframe, limit);
  const last = candles[candles.length - 1];
  return {
    symbol: q.symbol,
    company_name: q.company_name,
    sector: q.sector,
    timeframe,
    mode: "demo",
    source: "AlphaVyuh mock fixtures",
    source_metadata: {
      source_name: "AlphaVyuh mock fixtures",
      mode: "demo",
      as_of: last.time,
      confidence: "demo",
      coverage_pct: 100,
      symbols_count: 1,
      universe_active: 1,
      license_notes: "Deterministic mock candles for workflow QA, not market data.",
    },
    candles,
    latest: {
      close: last.close,
      pct_change: q.pct_change,
      volume: last.volume,
      volume_ratio: q.volume_ratio,
      rsi_14: q.rsi_14,
      ema_20: last.ema_20 ?? null,
      ema_50: last.ema_50 ?? null,
      ema_200: last.ema_200 ?? null,
      atr_14: q.atr_14,
      week_52_high: q.week_52_high,
      week_52_low: q.week_52_low,
      open: last.open,
      high: last.high,
      low: last.low,
      prev_close: candles[candles.length - 2]?.close ?? null,
    },
  };
}

export function mockIndicators(symbol: string): IndicatorsResponse {
  const candles = mockCandles(symbol, "D", 180).candles;
  return {
    symbol: symbol.toUpperCase(),
    indicators: {
      ema20: candles.filter((c) => c.ema_20 != null).map((c) => ({ time: c.time, value: c.ema_20 })),
      ema50: candles.filter((c) => c.ema_50 != null).map((c) => ({ time: c.time, value: c.ema_50 })),
      ema200: candles.filter((c) => c.ema_200 != null).map((c) => ({ time: c.time, value: c.ema_200 })),
      rsi: candles.map((c, i) => ({ time: c.time, value: 48 + Math.sin(i / 9) * 18 })),
      macd: candles.map((c, i) => ({
        time: c.time,
        macd: Math.sin(i / 11) * 4,
        signal: Math.sin((i - 3) / 11) * 3.5,
        histogram: Math.sin(i / 6),
      })),
    },
  };
}

export function mockSearchSymbols(q: string): SymbolSearchResult[] {
  const needle = q.toUpperCase();
  return MOCK_STOCKS
    .filter((s) => s.symbol.includes(needle) || s.company_name.toUpperCase().includes(needle))
    .map((s) => ({ symbol: s.symbol, company_name: s.company_name, sector: s.sector ?? null, series: "EQ" }));
}

export function mockJournalEntries(): { entries: JournalEntry[]; total: number; plan: string; history_months: null } {
  const entries: JournalEntry[] = [
    journal("j1", "DIXON", "long", 13940, 14220, 12, "Breakout continuation", "closed"),
    journal("j2", "RELIANCE", "long", 1364, null, 40, "Mean reversion at support", "open"),
    journal("j3", "PERSISTENT", "long", 4720, 4956, 20, "Stage 2 pullback", "closed"),
  ];
  return { entries, total: entries.length, plan: "mock", history_months: null };
}

export function mockJournalStats(): JournalStats {
  return {
    total_trades: 24,
    open_trades: 3,
    total_pnl: 68420,
    win_rate: 62.5,
    avg_pnl: 2850,
    avg_win: 7200,
    avg_loss: -3100,
    best_trade: 18600,
    worst_trade: -7400,
    avg_holding_days: 8,
  };
}

export function mockJournalAnalytics(): JournalAnalytics {
  return {
    equity_curve: [
      { date: "2026-01", cumulative_pnl: 12000 },
      { date: "2026-02", cumulative_pnl: 28400 },
      { date: "2026-03", cumulative_pnl: 43600 },
      { date: "2026-04", cumulative_pnl: 68420 },
    ],
    setup_breakdown: [
      { setup: "Breakout", trades: 10, wins: 7, win_rate: 70, total_pnl: 38200, avg_pnl: 3820 },
      { setup: "Pullback", trades: 8, wins: 5, win_rate: 62.5, total_pnl: 24600, avg_pnl: 3075 },
    ],
    monthly_pnl: [
      { month: "Jan", pnl: 12000 },
      { month: "Feb", pnl: 16400 },
      { month: "Mar", pnl: 15200 },
      { month: "Apr", pnl: 24820 },
    ],
    drawdown_curve: [
      { date: "2026-01", drawdown: 0, drawdown_pct: 0 },
      { date: "2026-02", drawdown: -4200, drawdown_pct: -3.1 },
      { date: "2026-03", drawdown: -1800, drawdown_pct: -1.2 },
    ],
    max_drawdown: -7400,
    longest_dd_days: 11,
    recovery_factor: 9.25,
    profit_factor: 2.4,
  };
}

export function mockPriceAlerts(): PriceAlert[] {
  return [
    { id: "pa1", symbol: "DIXON", condition: "above", target_price: 14500, note: "Breakout trigger", is_active: true, triggered_at: null, created_at: "2026-04-24T09:30:00Z" },
    { id: "pa2", symbol: "RELIANCE", condition: "below", target_price: 1310, note: "Support break", is_active: true, triggered_at: null, created_at: "2026-04-24T09:40:00Z" },
  ];
}

export function mockPortfolio(): PortfolioResponse {
  const positions = [
    position("DIXON", "Dixon Technologies", 13940, 14220, 12, "Breakout"),
    position("RELIANCE", "Reliance Industries", 1364, 1327.8, 40, "Support"),
    position("PERSISTENT", "Persistent Systems", 4720, 4956, 20, "Pullback"),
  ];
  const total_invested = positions.reduce((sum, p) => sum + p.invested, 0);
  const total_current = positions.reduce((sum, p) => sum + p.current_price * p.quantity, 0);
  const total_pnl = total_current - total_invested;
  return {
    positions,
    summary: {
      total_invested,
      total_current,
      total_pnl,
      total_pnl_pct: round(total_pnl / total_invested * 100),
      open_count: positions.length,
    },
    sectors: [
      { sector: "Consumer Durables", pnl: positions[0].unrealised_pnl },
      { sector: "Energy", pnl: positions[1].unrealised_pnl },
      { sector: "IT Services", pnl: positions[2].unrealised_pnl },
    ],
  };
}

function makeCandles(base: ScanResult, timeframe: string, requestedCount: number): CandleBar[] {
  const normalizedTimeframe = timeframe.toUpperCase();
  const stepDays = normalizedTimeframe === "W" ? 7 : normalizedTimeframe === "M" ? 30 : 1;
  const maxCount = normalizedTimeframe === "W" ? 620 : normalizedTimeframe === "M" ? 180 : 3200;
  const count = Math.max(2, Math.min(requestedCount || 180, maxCount));
  const end = new Date("2026-04-24T00:00:00Z");
  const dates: Date[] = [];
  if (normalizedTimeframe === "D") {
    const cursor = new Date(end);
    while (dates.length < count) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    dates.reverse();
  } else {
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (count - 1) * stepDays);
    for (let i = 0; i < count; i++) {
      const dt = new Date(start);
      dt.setUTCDate(start.getUTCDate() + i * stepDays);
      dates.push(dt);
    }
  }
  const rows: CandleBar[] = [];
  let price = base.close * 0.78;
  for (let i = 0; i < count; i++) {
    const trend = (base.close - price) / Math.max(1, count - i);
    const wave = Math.sin(i / 8) * base.close * 0.008;
    const open = price;
    const close = price + trend + wave;
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    const dt = dates[i];
    price = close;
    rows.push({
      time: dt.toISOString().slice(0, 10),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(base.avg_volume_20d * (0.8 + Math.abs(Math.sin(i / 5)) * 0.7)),
      ema_20: round(close * 0.985),
      ema_50: round(close * 0.96),
      ema_200: round(close * 0.9),
    });
  }
  return rows;
}

function journal(
  id: string,
  symbol: string,
  trade_type: "long" | "short",
  entry_price: number,
  exit_price: number | null,
  quantity: number,
  setup_type: string,
  status: "open" | "closed" | "cancelled",
): JournalEntry {
  const pnl = exit_price == null ? null : round((exit_price - entry_price) * quantity);
  return {
    id,
    user_id: "mock-user",
    symbol,
    company_name: mockQuote(symbol)?.company_name ?? null,
    trade_type,
    setup_type,
    entry_date: "2026-04-18",
    entry_price,
    quantity,
    exit_date: exit_price == null ? null : "2026-04-24",
    exit_price,
    pnl,
    pnl_pct: pnl == null ? null : round(pnl / (entry_price * quantity) * 100),
    holding_days: exit_price == null ? null : 6,
    stop_loss: round(entry_price * 0.96),
    target_price: round(entry_price * 1.08),
    risk_reward: 2,
    entry_reason: "Mock setup created for release/demo mode.",
    exit_reason: exit_price == null ? null : "Target zone reached.",
    mistakes: null,
    lessons: "Wait for confirmation and keep risk fixed.",
    status,
    created_at: "2026-04-18T09:30:00Z",
    updated_at: "2026-04-24T15:30:00Z",
  };
}

function position(
  symbol: string,
  company_name: string,
  entry_price: number,
  current_price: number,
  quantity: number,
  setup_type: string,
): PortfolioResponse["positions"][number] {
  const invested = entry_price * quantity;
  const current = current_price * quantity;
  const pnl = current - invested;
  return {
    id: `pos-${symbol}`,
    symbol,
    company_name,
    trade_type: "long",
    entry_date: "2026-04-18",
    entry_price,
    quantity,
    stop_loss: round(entry_price * 0.96),
    target_price: round(entry_price * 1.08),
    setup_type,
    current_price,
    day_change_pct: mockQuote(symbol)?.pct_change ?? null,
    unrealised_pnl: round(pnl),
    unrealised_pnl_pct: round(pnl / invested * 100),
    invested,
    sector: mockQuote(symbol)?.sector ?? null,
  };
}

function toMover(s: ScanResult) {
  return {
    symbol: s.symbol,
    company_name: s.company_name,
    close: s.close,
    pct_change: s.pct_change ?? 0,
    volume_ratio: s.volume_ratio,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
