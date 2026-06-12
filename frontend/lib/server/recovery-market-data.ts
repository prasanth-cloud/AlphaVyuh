import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type DailyRow = {
  symbol: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  prev_close: number | null;
  volume: number | null;
  avg_volume_20d?: number | null;
  avg_volume_50d?: number | null;
  turnover?: number | null;
  rsi_14?: number | null;
  ema_20?: number | null;
  ema_50?: number | null;
  ema_150?: number | null;
  ema_200?: number | null;
  ema_200_slope_30d?: number | null;
  atr_14?: number | null;
  week_52_high?: number | null;
  week_52_low?: number | null;
  high_3w?: number | null;
  low_3w?: number | null;
  darvas_box_height_pct?: number | null;
  price_perf_6m_pct?: number | null;
  pct_change?: number | null;
  gap_pct?: number | null;
  macd_hist?: number | null;
  bb_width?: number | null;
  stoch_k?: number | null;
  stoch_d?: number | null;
  adx_14?: number | null;
  delivery_pct?: number | null;
  is_new_52w_high?: boolean | null;
  is_new_52w_low?: boolean | null;
  is_inside_bar?: boolean | null;
  is_outside_bar?: boolean | null;
  is_nr7?: boolean | null;
  rs_score?: number | null;
  volume_ratio?: number | null;
  w52h_pct?: number | null;
  w52l_pct?: number | null;
  sma_50?: number | null;
  sma_150?: number | null;
  sma_200?: number | null;
  stock_universe?: UniverseRow | UniverseRow[] | null;
};

type UniverseRow = {
  symbol?: string | null;
  company_name?: string | null;
  series?: string | null;
  sector?: string | null;
  is_active?: boolean | null;
  market?: string | null;
  currency?: string | null;
  market_cap_cr?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  eps?: number | null;
  dividend_yield?: number | null;
  debt_to_equity?: number | null;
  roe?: number | null;
  roce?: number | null;
};

type ScanFilters = Record<string, unknown>;

const DAILY_SELECT = [
  "symbol",
  "trade_date",
  "open",
  "high",
  "low",
  "close",
  "prev_close",
  "volume",
  "avg_volume_20d",
  "avg_volume_50d",
  "turnover",
  "rsi_14",
  "ema_20",
  "ema_50",
  "ema_150",
  "ema_200",
  "ema_200_slope_30d",
  "atr_14",
  "week_52_high",
  "week_52_low",
  "high_3w",
  "low_3w",
  "darvas_box_height_pct",
  "price_perf_6m_pct",
  "pct_change",
  "gap_pct",
  "macd_hist",
  "bb_width",
  "stoch_k",
  "stoch_d",
  "adx_14",
  "delivery_pct",
  "is_new_52w_high",
  "is_new_52w_low",
  "is_inside_bar",
  "is_outside_bar",
  "is_nr7",
  "rs_score",
  "volume_ratio",
  "w52h_pct",
  "w52l_pct",
  "sma_50",
  "sma_150",
  "sma_200",
].join(",");

const RECOVERY_SCAN_ROW_CAP = 5000;
const UNCHANGED_MOVE_THRESHOLD_PCT = 0.05;

type FilterableQuery = {
  gte(column: string, value: number | string): FilterableQuery;
  lte(column: string, value: number | string): FilterableQuery;
  gt(column: string, value: number | string): FilterableQuery;
  lt(column: string, value: number | string): FilterableQuery;
  eq(column: string, value: boolean | number | string): FilterableQuery;
  in(column: string, values: string[]): FilterableQuery;
};

function filterBool(filters: ScanFilters, key: string): boolean | null {
  const value = filters[key];
  return value === true ? true : value === false ? false : null;
}

export function applyRecoveryDbFilters(query: FilterableQuery, filters: ScanFilters): FilterableQuery {
  let q: FilterableQuery = query;
  const num = (key: string) => numberValue(filters[key]);

  const priceMin = num("price_min");
  if (priceMin != null) q = q.gte("close", priceMin);
  const priceMax = num("price_max");
  if (priceMax != null) q = q.lte("close", priceMax);
  const highMin = num("high_min");
  if (highMin != null) q = q.gte("high", highMin);
  const lowMax = num("low_max");
  if (lowMax != null) q = q.lte("low", lowMax);
  const volumeMin = num("volume_min");
  if (volumeMin != null) q = q.gte("volume", volumeMin);
  const volumeMax = num("volume_max");
  if (volumeMax != null) q = q.lte("volume", volumeMax);
  const rsiMin = num("rsi_min");
  if (rsiMin != null) q = q.gte("rsi_14", rsiMin);
  const rsiMax = num("rsi_max");
  if (rsiMax != null) q = q.lte("rsi_14", rsiMax);
  const atrMin = num("atr_min");
  if (atrMin != null) q = q.gte("atr_14", atrMin);
  const atrMax = num("atr_max");
  if (atrMax != null) q = q.lte("atr_14", atrMax);
  const turnoverMin = num("turnover_min");
  if (turnoverMin != null) q = q.gte("turnover", turnoverMin);
  const turnoverMax = num("turnover_max");
  if (turnoverMax != null) q = q.lte("turnover", turnoverMax);
  const turnoverMinCr = num("turnover_min_cr");
  if (turnoverMinCr != null) q = q.gte("turnover", turnoverMinCr * 10_000_000);
  const pctChangeMin = num("pct_change_min");
  if (pctChangeMin != null) q = q.gte("pct_change", pctChangeMin);
  const pctChangeMax = num("pct_change_max");
  if (pctChangeMax != null) q = q.lte("pct_change", pctChangeMax);
  const gapPctMin = num("gap_pct_min");
  if (gapPctMin != null) q = q.gte("gap_pct", gapPctMin);
  const gapPctMax = num("gap_pct_max");
  if (gapPctMax != null) q = q.lte("gap_pct", gapPctMax);
  const adxMin = num("adx_min");
  if (adxMin != null) q = q.gte("adx_14", adxMin);
  const adxMax = num("adx_max");
  if (adxMax != null) q = q.lte("adx_14", adxMax);
  const volumeRatioMin = num("volume_ratio_min");
  if (volumeRatioMin != null) q = q.gte("volume_ratio", volumeRatioMin);
  const volumeRatioMax = num("volume_ratio_max");
  if (volumeRatioMax != null) q = q.lte("volume_ratio", volumeRatioMax);
  const rsScoreMin = num("rs_score_min");
  if (rsScoreMin != null) q = q.gte("rs_score", rsScoreMin);
  const rsScoreMax = num("rs_score_max");
  if (rsScoreMax != null) q = q.lte("rs_score", rsScoreMax);
  const w52hMax = num("w52h_pct_max") ?? num("week_52_high_pct_max");
  if (w52hMax != null) q = q.lte("w52h_pct", w52hMax);
  const w52lMin = num("w52l_pct_min");
  if (w52lMin != null) q = q.gte("w52l_pct", w52lMin);
  const avgVolume50dMin = num("avg_volume_50d_min");
  if (avgVolume50dMin != null) q = q.gte("avg_volume_50d", avgVolume50dMin);
  const avgVolume50dMax = num("avg_volume_50d_max");
  if (avgVolume50dMax != null) q = q.lte("avg_volume_50d", avgVolume50dMax);
  const pricePerf6mMin = num("price_perf_6m_min");
  if (pricePerf6mMin != null) q = q.gte("price_perf_6m_pct", pricePerf6mMin);
  const pricePerf6mMax = num("price_perf_6m_max");
  if (pricePerf6mMax != null) q = q.lte("price_perf_6m_pct", pricePerf6mMax);
  const ema200SlopeMin = num("ema_200_slope_30d_min");
  if (ema200SlopeMin != null) q = q.gte("ema_200_slope_30d", ema200SlopeMin);
  const ema200SlopeMax = num("ema_200_slope_30d_max");
  if (ema200SlopeMax != null) q = q.lte("ema_200_slope_30d", ema200SlopeMax);
  if (filterBool(filters, "ema_200_trending_up") === true) q = q.gt("ema_200_slope_30d", 0);
  if (filterBool(filters, "is_inside_bar") === true) q = q.eq("is_inside_bar", true);
  if (filterBool(filters, "is_outside_bar") === true) q = q.eq("is_outside_bar", true);
  if (filterBool(filters, "macd_hist_positive") === true) q = q.gt("macd_hist", 0);
  if (filterBool(filters, "macd_hist_positive") === false) q = q.lt("macd_hist", 0);

  const series = Array.isArray(filters.series) ? filters.series.map(String) : [];
  if (series.length) q = q.in("stock_universe.series", series);

  return q;
}

const DAILY_WITH_UNIVERSE_SELECT = `${DAILY_SELECT},stock_universe!daily_ohlcv_symbol_fkey!inner(symbol,company_name,series,sector,is_active,market,currency,market_cap_cr,pe_ratio,pb_ratio,eps,dividend_yield,debt_to_equity,roe,roce)`;

function cleanEnv(value?: string | null): string {
  return String(value ?? "").trim().replace(/^['"`]|['"`]$/g, "");
}

export function recoverySupabaseConfigured(): boolean {
  return Boolean(cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY) && recoverySupabaseUrl());
}

function recoverySupabaseUrl(): string {
  return cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getRecoverySupabaseClient(): SupabaseClient {
  const url = recoverySupabaseUrl();
  const serviceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey) {
    throw new Error("Vercel recovery API is missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sourceMetadata(asOf: string | null, symbolsCount?: number | null, universeActive?: number | null) {
  const coveragePct = symbolsCount != null && universeActive ? Number(((symbolsCount / universeActive) * 100).toFixed(1)) : null;
  return {
    source_name: "NSE bhavcopy",
    mode: coveragePct != null && coveragePct < 90 ? "fallback" : "eod",
    as_of: asOf,
    generated_at: new Date().toISOString(),
    confidence: coveragePct != null && coveragePct < 90 ? "degraded" : "healthy",
    coverage_pct: coveragePct,
    symbols_count: symbolsCount ?? null,
    universe_active: universeActive ?? null,
    cache_status: "vercel_recovery",
    license_notes: "NSE bhavcopy data from the latest completed market session; not a licensed realtime feed.",
  };
}

function firstUniverse(row: DailyRow): UniverseRow {
  const meta = row.stock_universe;
  if (Array.isArray(meta)) return meta[0] ?? {};
  return meta ?? {};
}

function numberValue(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pctChange(row: DailyRow): number | null {
  const explicit = numberValue(row.pct_change);
  if (explicit != null) return explicit;
  const close = numberValue(row.close);
  const prev = numberValue(row.prev_close);
  if (close == null || prev == null || prev <= 0) return null;
  return Number((((close - prev) / prev) * 100).toFixed(2));
}

function volumeRatio(row: DailyRow): number | null {
  const explicit = numberValue(row.volume_ratio);
  if (explicit != null) return explicit;
  const volume = numberValue(row.volume);
  const average = numberValue(row.avg_volume_20d);
  if (volume == null || average == null || average <= 0) return null;
  return Number((volume / average).toFixed(2));
}

function w52HighPct(row: DailyRow): number | null {
  const explicit = numberValue(row.w52h_pct);
  if (explicit != null) return explicit;
  const close = numberValue(row.close);
  const high = numberValue(row.week_52_high);
  if (close == null || high == null || high <= 0) return null;
  return Number((((high - close) / high) * 100).toFixed(2));
}

function w52LowPct(row: DailyRow): number | null {
  const explicit = numberValue(row.w52l_pct);
  if (explicit != null) return explicit;
  const close = numberValue(row.close);
  const low = numberValue(row.week_52_low);
  if (close == null || low == null || low <= 0) return null;
  return Number((((close - low) / low) * 100).toFixed(2));
}

function candleFromRow(row: DailyRow) {
  return {
    time: row.trade_date,
    open: numberValue(row.open) ?? 0,
    high: numberValue(row.high) ?? 0,
    low: numberValue(row.low) ?? 0,
    close: numberValue(row.close) ?? 0,
    volume: Math.trunc(numberValue(row.volume) ?? 0),
    ema_20: numberValue(row.ema_20),
    ema_50: numberValue(row.ema_50),
    ema_200: numberValue(row.ema_200),
  };
}

function intelligenceDataWarnings(row: DailyRow): string[] {
  const warnings: string[] = [];
  if (numberValue(row.ema_150) == null) {
    warnings.push("EMA 150 is unavailable until the scanner intelligence migration is applied/backfilled.");
  }
  if (numberValue(row.ema_200_slope_30d) == null) {
    warnings.push("EMA 200 slope is unavailable until the scanner intelligence migration is applied/backfilled.");
  }
  if (numberValue(row.avg_volume_50d) == null) {
    warnings.push("50-day average volume is unavailable.");
  }
  if (numberValue(row.price_perf_6m_pct) == null) {
    warnings.push("6-month price performance is unavailable until the scanner intelligence migration is applied/backfilled.");
  }
  if (numberValue(row.high_3w) == null || numberValue(row.low_3w) == null) {
    warnings.push("3-week box height is unavailable until the scanner intelligence migration is applied/backfilled.");
  }
  if (row.is_nr7 == null) {
    warnings.push("NR7 range flag is unavailable.");
  }
  return warnings;
}

function scanResultFromRow(row: DailyRow) {
  const meta = firstUniverse(row);
  const close = numberValue(row.close) ?? 0;
  const high52 = numberValue(row.week_52_high);
  const low52 = numberValue(row.week_52_low);
  const high3w = numberValue(row.high_3w);
  const low3w = numberValue(row.low_3w);
  return {
    symbol: row.symbol,
    company_name: meta.company_name || row.symbol,
    series: meta.series || "EQ",
    sector: meta.sector ?? null,
    market: meta.market || "NSE",
    currency: meta.currency || "INR",
    close,
    prev_close: numberValue(row.prev_close) ?? close,
    open: numberValue(row.open) ?? close,
    high: numberValue(row.high) ?? close,
    low: numberValue(row.low) ?? close,
    pct_change: pctChange(row),
    gap_pct: numberValue(row.gap_pct),
    volume: Math.trunc(numberValue(row.volume) ?? 0),
    avg_volume_20d: numberValue(row.avg_volume_20d) ?? 0,
    avg_volume_50d: numberValue(row.avg_volume_50d),
    volume_ratio: volumeRatio(row),
    turnover: numberValue(row.turnover),
    turnover_cr: numberValue(row.turnover) != null ? Number((numberValue(row.turnover)! / 10_000_000).toFixed(2)) : null,
    rsi_14: numberValue(row.rsi_14),
    ema_20: numberValue(row.ema_20),
    ema_50: numberValue(row.ema_50),
    ema_150: numberValue(row.ema_150),
    ema_200: numberValue(row.ema_200),
    ema_200_slope_30d: numberValue(row.ema_200_slope_30d),
    ema_20_dist: numberValue(row.ema_20) ? Number((((close - numberValue(row.ema_20)!) / numberValue(row.ema_20)!) * 100).toFixed(2)) : null,
    ema_50_dist: numberValue(row.ema_50) ? Number((((close - numberValue(row.ema_50)!) / numberValue(row.ema_50)!) * 100).toFixed(2)) : null,
    week_52_high: high52,
    week_52_low: low52,
    week_52_high_pct: w52HighPct(row),
    week_52_low_pct: w52LowPct(row),
    price_perf_6m_pct: numberValue(row.price_perf_6m_pct),
    high_3w: high3w,
    low_3w: low3w,
    darvas_box_height_pct: numberValue(row.darvas_box_height_pct),
    atr_14: numberValue(row.atr_14),
    atr_pct: numberValue(row.atr_14) && close > 0 ? Number(((numberValue(row.atr_14)! / close) * 100).toFixed(2)) : null,
    macd_hist: numberValue(row.macd_hist),
    bb_width: numberValue(row.bb_width),
    stoch_k: numberValue(row.stoch_k),
    adx_14: numberValue(row.adx_14),
    delivery_pct: numberValue(row.delivery_pct),
    is_new_52w_high: Boolean(row.is_new_52w_high || (high52 != null && close >= high52)),
    is_nr7: row.is_nr7 ?? null,
    is_inside_bar: Boolean(row.is_inside_bar),
    rs_score: numberValue(row.rs_score),
    market_cap_cr: numberValue(meta.market_cap_cr),
    pe_ratio: numberValue(meta.pe_ratio),
    pb_ratio: numberValue(meta.pb_ratio),
    eps: numberValue(meta.eps),
    dividend_yield: numberValue(meta.dividend_yield),
    roe: numberValue(meta.roe),
    roce: numberValue(meta.roce),
    match_reasons: recoveryMatchReasons(row),
    data_warnings: intelligenceDataWarnings(row),
  };
}

function recoveryMatchReasons(row: DailyRow): string[] {
  const reasons: string[] = ["Latest EOD market row is available"];
  const pct = pctChange(row);
  const ratio = volumeRatio(row);
  if (pct != null && pct > 0) reasons.push(`Positive session move ${pct.toFixed(2)}%`);
  if (ratio != null && ratio >= 1.5) reasons.push(`Volume ${ratio.toFixed(2)}x 20-day average`);
  if (row.ema_20 != null && row.ema_50 != null && Number(row.ema_20) >= Number(row.ema_50)) reasons.push("EMA 20 above EMA 50");
  return reasons;
}

export async function getLatestTradeDate(client = getRecoverySupabaseClient()): Promise<string | null> {
  const { data, error } = await client
    .from("daily_ohlcv")
    .select("trade_date")
    .order("trade_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.trade_date ?? null;
}

function isActiveNseEqRow(row: DailyRow): boolean {
  const meta = firstUniverse(row);
  return meta.series === "EQ" && meta.market === "NSE" && meta.is_active !== false;
}

function sessionPctChange(row: DailyRow): number | null {
  const explicit = pctChange(row);
  if (explicit == null) return null;
  return explicit;
}

function isAdvance(pct: number | null): boolean {
  return pct != null && pct > UNCHANGED_MOVE_THRESHOLD_PCT;
}

function isDecline(pct: number | null): boolean {
  return pct != null && pct < -UNCHANGED_MOVE_THRESHOLD_PCT;
}

function emaBreadthPct(rows: DailyRow[]): { ema20: number; ema50: number; ema200: number } {
  const eligible = rows.filter((row) => numberValue(row.close) != null);
  const ema20Valid = eligible.filter((row) => numberValue(row.ema_20) != null);
  const ema50Valid = eligible.filter((row) => numberValue(row.ema_50) != null);
  const ema200Valid = eligible.filter((row) => numberValue(row.ema_200) != null);
  const above = (target: DailyRow[], emaKey: "ema_20" | "ema_50" | "ema_200") =>
    target.filter((row) => {
      const close = numberValue(row.close);
      const ema = numberValue(row[emaKey]);
      return close != null && ema != null && close >= ema;
    }).length;
  return {
    ema20: ema20Valid.length ? Number(((above(ema20Valid, "ema_20") / ema20Valid.length) * 100).toFixed(1)) : 0,
    ema50: ema50Valid.length ? Number(((above(ema50Valid, "ema_50") / ema50Valid.length) * 100).toFixed(1)) : 0,
    ema200: ema200Valid.length ? Number(((above(ema200Valid, "ema_200") / ema200Valid.length) * 100).toFixed(1)) : 0,
  };
}

function highsLowsCounts(rows: DailyRow[]): { highs: number; lows: number } {
  let highs = rows.filter((row) => row.is_new_52w_high).length;
  let lows = rows.filter((row) => row.is_new_52w_low).length;
  if (highs === 0) {
    highs = rows.filter((row) => {
      const close = numberValue(row.close);
      const high = numberValue(row.week_52_high);
      return close != null && high != null && close >= high * 0.995;
    }).length;
  }
  if (lows === 0) {
    lows = rows.filter((row) => {
      const close = numberValue(row.close);
      const low = numberValue(row.week_52_low);
      return close != null && low != null && close <= low * 1.005;
    }).length;
  }
  return { highs, lows };
}

function moverFromRow(row: DailyRow) {
  const meta = firstUniverse(row);
  return {
    symbol: row.symbol,
    company_name: meta.company_name || row.symbol,
    close: numberValue(row.close) ?? 0,
    pct_change: pctChange(row) ?? 0,
    volume_ratio: volumeRatio(row),
  };
}

async function listRecentTradeDates(client: SupabaseClient, endDate: string, limit = 260): Promise<string[]> {
  const { data, error } = await client
    .from("daily_ohlcv")
    .select("trade_date")
    .lte("trade_date", endDate)
    .order("trade_date", { ascending: false })
    .limit(limit * 20);
  if (error) throw error;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of data ?? []) {
    const tradeDate = row.trade_date as string | undefined;
    if (!tradeDate || seen.has(tradeDate)) continue;
    seen.add(tradeDate);
    ordered.push(tradeDate);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

export async function getLatestCompleteTradeDate(client = getRecoverySupabaseClient()): Promise<string | null> {
  const universeActive = await getUniverseCount(client);
  const requiredRows = universeActive ? Math.max(1000, Math.floor(universeActive * 0.75)) : 1000;
  const { data, error } = await client
    .from("daily_ohlcv")
    .select("trade_date,symbol,close,prev_close,pct_change,stock_universe!daily_ohlcv_symbol_fkey!inner(series,market,is_active)")
    .order("trade_date", { ascending: false })
    .limit(20000);
  if (error) throw error;
  const dateRows = new Map<string, DailyRow[]>();
  for (const row of (data ?? []) as unknown as DailyRow[]) {
    const meta = firstUniverse(row);
    if (meta.series !== "EQ" || meta.market !== "NSE" || meta.is_active === false) continue;
    const close = numberValue(row.close);
    if (close == null || close <= 0) continue;
    const prev = numberValue(row.prev_close);
    if ((prev == null || prev <= 0) && row.pct_change == null) continue;
    const bucket = dateRows.get(row.trade_date) ?? [];
    bucket.push(row);
    dateRows.set(row.trade_date, bucket);
  }
  const sortedDates = [...dateRows.keys()].sort((a, b) => b.localeCompare(a));
  for (const tradeDate of sortedDates) {
    const rows = dateRows.get(tradeDate) ?? [];
    if (rows.length < requiredRows) continue;
    const advances = rows.filter((row) => isAdvance(sessionPctChange(row))).length;
    const declines = rows.filter((row) => isDecline(sessionPctChange(row))).length;
    const unchanged = Math.max(rows.length - advances - declines, 0);
    const movingRatio = (advances + declines) / rows.length;
    const unchangedRatio = unchanged / rows.length;
    if (unchangedRatio >= 0.85 && movingRatio < 0.08) continue;
    return tradeDate;
  }
  return sortedDates[0] ?? null;
}

export async function getUniverseCount(client = getRecoverySupabaseClient()): Promise<number | null> {
  const { count, error } = await client
    .from("stock_universe")
    .select("symbol", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) return null;
  return count ?? null;
}

export async function getLatestCoverage(client = getRecoverySupabaseClient(), tradeDate?: string | null) {
  const latest = tradeDate ?? await getLatestTradeDate(client);
  if (!latest) return { trade_date: null, symbols_count: 0, universe_active: await getUniverseCount(client) };
  const { count, error } = await client
    .from("daily_ohlcv")
    .select("symbol", { count: "exact", head: true })
    .eq("trade_date", latest);
  if (error) throw error;
  return {
    trade_date: latest,
    symbols_count: count ?? 0,
    universe_active: await getUniverseCount(client),
  };
}

export async function getRecoveryHealth() {
  const client = getRecoverySupabaseClient();
  const coverage = await getLatestCoverage(client);
  return {
    status: "ok",
    mode: "vercel_readonly_recovery",
    trade_date: coverage.trade_date,
    source_metadata: sourceMetadata(coverage.trade_date, coverage.symbols_count, coverage.universe_active),
  };
}

export async function getRecoveryDataHealth() {
  const client = getRecoverySupabaseClient();
  const coverage = await getLatestCoverage(client);
  const metadata = sourceMetadata(coverage.trade_date, coverage.symbols_count, coverage.universe_active);
  return {
    status: metadata.confidence === "healthy" ? "healthy" : "degraded",
    latest_trade_date: coverage.trade_date,
    last_successful_eod_date: coverage.trade_date,
    hours_since_refresh: null,
    symbols_on_latest_date: coverage.symbols_count,
    universe_active: coverage.universe_active,
    coverage_pct: metadata.coverage_pct,
    mode: metadata.mode,
    message: "Vercel read-only recovery is serving the latest Supabase EOD data while Railway backend recovery is pending.",
    indicators_missing: {
      rsi_14: null,
      ema_200: null,
    },
    last_run: {
      id: "vercel-readonly-recovery",
      errors: null,
    },
    provider: metadata,
    fallback_active: false,
    next_refresh_hint: "Recover Railway for writes, broker sync, and scheduled ingest orchestration.",
    live_market: null,
  };
}

export async function getRecoveryCandles(symbol: string, options: { timeframe?: string; from_date?: string | null; to_date?: string | null; limit?: number }) {
  const client = getRecoverySupabaseClient();
  const sym = symbol.trim().toUpperCase();
  const timeframe = (options.timeframe || "D").toUpperCase();
  const limit = Math.min(Math.max(Number(options.limit) || 365, 1), 3000);
  if (!["D", "W", "M"].includes(timeframe)) {
    return unavailable("Intraday candle data is not available for Professional Access yet.", 422);
  }

  const metaQuery = await client
    .from("stock_universe")
    .select("symbol,company_name,sector,series")
    .eq("symbol", sym)
    .maybeSingle();
  if (metaQuery.error) throw metaQuery.error;

  let query = client
    .from("daily_ohlcv")
    .select(DAILY_SELECT)
    .eq("symbol", sym)
    .order("trade_date", { ascending: false })
    .limit(timeframe === "D" ? limit : Math.min(limit * (timeframe === "W" ? 7 : 31), 3000));
  if (options.from_date) query = query.gte("trade_date", options.from_date);
  if (options.to_date) query = query.lte("trade_date", options.to_date);
  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as unknown as DailyRow[]).reverse();
  if (!rows.length) return unavailable(`No candle data found for ${sym}`, 404);

  const candles = aggregateCandles(rows, timeframe).slice(-limit);
  const last = rows.at(-1)!;
  const latest = {
    close: numberValue(last.close),
    pct_change: pctChange(last),
    volume: Math.trunc(numberValue(last.volume) ?? 0),
    volume_ratio: volumeRatio(last),
    rsi_14: numberValue(last.rsi_14),
    ema_20: numberValue(last.ema_20),
    ema_50: numberValue(last.ema_50),
    ema_200: numberValue(last.ema_200),
    atr_14: numberValue(last.atr_14),
    week_52_high: numberValue(last.week_52_high),
    week_52_low: numberValue(last.week_52_low),
    open: numberValue(last.open),
    high: numberValue(last.high),
    low: numberValue(last.low),
    prev_close: numberValue(last.prev_close),
  };
  const lastTime = candles.at(-1)?.time ?? null;
  const metadata = sourceMetadata(lastTime, 1, 1);
  return {
    symbol: sym,
    requested_symbol: sym,
    resolved_from_alias: false,
    alias: null,
    company_name: metaQuery.data?.company_name ?? sym,
    sector: metaQuery.data?.sector ?? null,
    timeframe,
    candles,
    latest,
    mode: metadata.mode,
    source: metadata.source_name,
    source_metadata: metadata,
    coverage: {
      requested_from: options.from_date ?? null,
      requested_to: options.to_date ?? null,
      available_from: candles[0]?.time ?? null,
      available_to: lastTime,
      returned_candles: candles.length,
      requested_limit: limit,
      timeframe,
      partial: candles.length === 0,
      partial_reason: candles.length === 0 ? "no_candles" : null,
      source_name: metadata.source_name,
      as_of: lastTime,
    },
    adjusted: false,
    adjustment_source: null,
  };
}

function aggregateCandles(rows: DailyRow[], timeframe: string) {
  if (timeframe === "D") return rows.map(candleFromRow);
  const buckets = new Map<string, DailyRow[]>();
  for (const row of rows) {
    const date = new Date(`${row.trade_date}T00:00:00Z`);
    const key = timeframe === "W"
      ? `${date.getUTCFullYear()}-W${Math.floor((dayOfYear(date) + 6) / 7).toString().padStart(2, "0")}`
      : `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}`;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  return Array.from(buckets.values()).map((bucket) => {
    const first = bucket[0];
    const last = bucket.at(-1)!;
    return {
      time: last.trade_date,
      open: numberValue(first.open) ?? 0,
      high: Math.max(...bucket.map((row) => numberValue(row.high) ?? Number.NEGATIVE_INFINITY)),
      low: Math.min(...bucket.map((row) => numberValue(row.low) ?? Number.POSITIVE_INFINITY)),
      close: numberValue(last.close) ?? 0,
      volume: bucket.reduce((sum, row) => sum + (numberValue(row.volume) ?? 0), 0),
    };
  });
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export async function getRecoveryIndicators(symbol: string, requested: string[], timeframe = "D") {
  const candlesPayload = await getRecoveryCandles(symbol, { timeframe, limit: 500 });
  if ("statusCode" in candlesPayload) return candlesPayload;
  const candles = candlesPayload.candles;
  const indicators: Record<string, unknown[]> = {};
  const clean = requested.map((value) => value.toLowerCase().trim());
  const closes = candles.map((candle) => candle.close);
  if (clean.includes("ema20")) indicators.ema20 = ema(closes, 20, candles);
  if (clean.includes("ema50")) indicators.ema50 = ema(closes, 50, candles);
  if (clean.includes("ema200")) indicators.ema200 = ema(closes, 200, candles);
  if (clean.includes("rsi")) indicators.rsi = rsi(closes, 14, candles);
  return { symbol: symbol.trim().toUpperCase(), timeframe, indicators };
}

function ema(values: number[], period: number, candles: Array<{ time: string }>) {
  const alpha = 2 / (period + 1);
  let current: number | null = null;
  return values.flatMap((value, index) => {
    current = current == null ? value : value * alpha + current * (1 - alpha);
    return index >= period - 1 ? [{ time: candles[index].time, value: Number(current.toFixed(4)) }] : [];
  }).slice(-365);
}

function rsi(values: number[], period: number, candles: Array<{ time: string }>) {
  let avgGain = 0;
  let avgLoss = 0;
  const out: Array<{ time: string; value: number }> = [];
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (index <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (index >= period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const value = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      out.push({ time: candles[index].time, value: Number(value.toFixed(4)) });
    }
  }
  return out.slice(-365);
}

export async function getRecoveryMarketOverview() {
  const client = getRecoverySupabaseClient();
  const latest = await getLatestCompleteTradeDate(client);
  if (!latest) return unavailable("Market summary is temporarily unavailable.", 503);
  const rows = await latestRows(client, latest);
  if (!rows.length) return unavailable("Market summary is temporarily unavailable.", 503);
  const universeActive = await getUniverseCount(client);
  const metadata = sourceMetadata(latest, rows.length, universeActive);
  const advances = rows.filter((row) => isAdvance(sessionPctChange(row))).length;
  const declines = rows.filter((row) => isDecline(sessionPctChange(row))).length;
  const unchanged = Math.max(rows.length - advances - declines, 0);
  const dailyCounts = highsLowsCounts(rows);
  const sectorMap = new Map<string, DailyRow[]>();
  for (const row of rows) {
    const sector = firstUniverse(row).sector || "Unclassified";
    sectorMap.set(sector, [...(sectorMap.get(sector) ?? []), row]);
  }
  const sector_breadth = Array.from(sectorMap.entries()).map(([sector, sectorRows]) => {
    const sectorAdvances = sectorRows.filter((row) => isAdvance(sessionPctChange(row))).length;
    const sectorDeclines = sectorRows.filter((row) => isDecline(sessionPctChange(row))).length;
    const advanceBreadth = sectorRows.length
      ? Number(((sectorAdvances / sectorRows.length) * 100).toFixed(1))
      : 0;
    const avgPct = sectorRows.length
      ? Number((sectorRows.reduce((sum, row) => sum + (sessionPctChange(row) ?? 0), 0) / sectorRows.length).toFixed(2))
      : 0;
    const ema20Valid = sectorRows.filter((row) => numberValue(row.ema_20) != null);
    const aboveEma20 = ema20Valid.filter((row) => {
      const close = numberValue(row.close);
      const ema = numberValue(row.ema_20);
      return close != null && ema != null && close >= ema;
    }).length;
    return {
      sector,
      total: sectorRows.length,
      advances: sectorAdvances,
      declines: sectorDeclines,
      unchanged: Math.max(sectorRows.length - sectorAdvances - sectorDeclines, 0),
      ad_ratio: sectorDeclines > 0 ? Number((sectorAdvances / sectorDeclines).toFixed(2)) : sectorAdvances,
      avg_pct_change: avgPct,
      breadth_pct: advanceBreadth,
      advance_breadth_pct: advanceBreadth,
      above_ema20_pct: ema20Valid.length ? Number(((aboveEma20 / ema20Valid.length) * 100).toFixed(1)) : null,
      basis: "advancing_constituents",
    };
  }).sort((a, b) => b.avg_pct_change - a.avg_pct_change);
  const withPct = rows.filter((row) => sessionPctChange(row) != null);
  const top_gainers = [...withPct]
    .sort((a, b) => (sessionPctChange(b) ?? -999) - (sessionPctChange(a) ?? -999))
    .slice(0, 5)
    .map(moverFromRow);
  const top_losers = [...withPct]
    .sort((a, b) => (sessionPctChange(a) ?? 999) - (sessionPctChange(b) ?? 999))
    .slice(0, 5)
    .map(moverFromRow);
  const most_active = [...rows]
    .sort((a, b) => (numberValue(b.volume) ?? 0) - (numberValue(a.volume) ?? 0))
    .slice(0, 5)
    .map(moverFromRow);
  const emaDay = emaBreadthPct(rows);
  const tradeDates = await listRecentTradeDates(client, latest);
  const periodOffsets: Record<"week" | "month" | "year", number> = {
    week: 4,
    month: 21,
    year: 251,
  };
  const ema_breadth_by_period: Record<string, { ema20: number; ema50: number; ema200: number } | null> = {
    day: emaDay,
  };
  for (const period of ["week", "month", "year"] as const) {
    const tradeDate = tradeDates[periodOffsets[period]];
    if (!tradeDate) {
      ema_breadth_by_period[period] = null;
      continue;
    }
    const periodRows = await latestRows(client, tradeDate);
    ema_breadth_by_period[period] = periodRows.length ? emaBreadthPct(periodRows) : null;
  }
  let weeklyHighs = 0;
  let weeklyLows = 0;
  for (const tradeDate of tradeDates.slice(0, 5)) {
    const periodRows = await latestRows(client, tradeDate);
    const counts = highsLowsCounts(periodRows);
    weeklyHighs += counts.highs;
    weeklyLows += counts.lows;
  }
  const ema_breadth_daily_history: { trade_date: string; ema20: number; ema50: number; ema200: number }[] = [];
  for (const tradeDate of tradeDates.slice(0, 15)) {
    const periodRows = await latestRows(client, tradeDate);
    if (!periodRows.length) continue;
    const breadth = emaBreadthPct(periodRows);
    ema_breadth_daily_history.push({
      trade_date: tradeDate,
      ema20: breadth.ema20,
      ema50: breadth.ema50,
      ema200: breadth.ema200,
    });
  }
  const ema200Pct = emaDay.ema200;
  return {
    trade_date: latest,
    advances,
    declines,
    unchanged,
    total: rows.length,
    advance_decline_ratio: declines > 0 ? Number((advances / declines).toFixed(2)) : advances,
    new_52w_highs: dailyCounts.highs,
    new_52w_lows: dailyCounts.lows,
    above_ema20_count: rows.filter((row) => {
      const close = numberValue(row.close);
      const ema = numberValue(row.ema_20);
      return close != null && ema != null && close >= ema;
    }).length,
    above_ema20_pct: emaDay.ema20,
    above_ema50_count: rows.filter((row) => {
      const close = numberValue(row.close);
      const ema = numberValue(row.ema_50);
      return close != null && ema != null && close >= ema;
    }).length,
    above_ema50_pct: emaDay.ema50,
    above_ema200_count: rows.filter((row) => {
      const close = numberValue(row.close);
      const ema = numberValue(row.ema_200);
      return close != null && ema != null && close >= ema;
    }).length,
    above_ema200_pct: ema200Pct,
    ema_breadth_by_period,
    ema_breadth_daily_history,
    highs_lows_by_period: {
      daily: dailyCounts,
      weekly: { highs: weeklyHighs, lows: weeklyLows },
    },
    market_phase: ema200Pct >= 60 ? "Bullish" : ema200Pct <= 40 ? "Bearish" : "Neutral",
    market_phase_desc: "Computed from latest complete NSE EQ EOD breadth (NSE bhavcopy via Supabase).",
    sector_breadth,
    sector_breadth_basis: "advancing_constituents",
    sector_breadth_source: "daily_ohlcv",
    top_sectors: sector_breadth.slice(0, 5),
    top_gainers,
    top_losers,
    most_active,
    indices: [],
    market_data_source: "vercel_readonly_recovery",
    is_live: false,
    as_of: latest,
    generated_at: new Date().toISOString(),
    cache_status: "vercel_recovery",
    provider: metadata,
    source_metadata: metadata,
    mode: metadata.mode,
  };
}

export async function getRecoveryMarketSummary() {
  const overview = await getRecoveryMarketOverview();
  if ("statusCode" in overview) return overview;
  return {
    trade_date: overview.trade_date,
    advances: overview.advances,
    declines: overview.declines,
    unchanged: overview.unchanged,
    advance_decline_ratio: overview.advance_decline_ratio,
    new_52w_highs: overview.new_52w_highs,
    new_52w_lows: overview.new_52w_lows,
    above_ema20_pct: overview.above_ema20_pct,
    above_ema50_pct: overview.above_ema50_pct,
    above_ema200_pct: overview.above_ema200_pct,
    total_stocks: overview.total,
    mode: overview.mode,
    source_metadata: overview.source_metadata,
  };
}

export async function runRecoveryScanner(body: { filters?: ScanFilters; sort_by?: string; sort_order?: string; page?: number; page_size?: number }) {
  const filters = body.filters ?? {};
  if (filters.vcp_contraction === true) {
    return unavailable(
      "VCP contraction scans require the full scanner API with multi-day pivot analysis. Recovery mode only supports single-day EOD filters.",
      422,
    );
  }
  const client = getRecoverySupabaseClient();
  const latest = await getLatestCompleteTradeDate(client);
  if (!latest) return unavailable("No complete trade date is available for scanner.", 503);
  const rows = await latestRows(client, latest, filters);
  const filtered = rows.filter((row) => rowMatchesFilters(row, filters));
  const sortKey = String(body.sort_by || "volume_ratio");
  const direction = body.sort_order === "asc" ? 1 : -1;
  filtered.sort((a, b) => direction * ((scanSortValue(a, sortKey) ?? -Infinity) - (scanSortValue(b, sortKey) ?? -Infinity)));
  const pageSize = [0, 25, 50, 150, 200].includes(Number(body.page_size)) ? Number(body.page_size) : 25;
  const page = Math.max(Number(body.page) || 1, 1);
  const capped = filtered.slice(0, 200);
  const paged = pageSize === 0 ? capped : capped.slice((page - 1) * pageSize, page * pageSize);
  const coverage = await getLatestCoverage(client, latest);
  const metadata = sourceMetadata(latest, coverage.symbols_count, coverage.universe_active);
  const scanResults = paged.map(scanResultFromRow);
  const incomplete_indicator_count = scanResults.filter((result) => (result.data_warnings?.length ?? 0) > 0).length;
  return {
    trade_date: latest,
    total_matches: filtered.length,
    plan_limit: 200,
    plan: "recovery",
    is_limited: filtered.length > 200,
    page,
    page_size: pageSize,
    total_pages: pageSize === 0 ? 1 : Math.max(1, Math.ceil(capped.length / pageSize)),
    visible_count: paged.length,
    results: scanResults,
    source_metadata: metadata,
    mode: metadata.mode,
    source: metadata.source_name,
    coverage_pct: metadata.coverage_pct,
    universe_size: coverage.universe_active,
    incomplete_indicator_count,
    recovery_mode: "vercel_readonly",
  };
}

async function latestRows(client: SupabaseClient, latest: string, filters: ScanFilters = {}) {
  const rows: DailyRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < RECOVERY_SCAN_ROW_CAP; offset += pageSize) {
    const baseQuery = client
      .from("daily_ohlcv")
      .select(DAILY_WITH_UNIVERSE_SELECT)
      .eq("trade_date", latest)
      .eq("stock_universe.series", "EQ")
      .eq("stock_universe.market", "NSE")
      .eq("stock_universe.is_active", true);
    const filteredQuery = applyRecoveryDbFilters(baseQuery as unknown as FilterableQuery, filters);
    const { data, error } = await (filteredQuery as unknown as typeof baseQuery).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as DailyRow[];
    rows.push(...page.filter(isActiveNseEqRow));
    if (page.length < pageSize) break;
  }
  return rows;
}

export function rowMatchesFilters(row: DailyRow, filters: ScanFilters): boolean {
  const result = scanResultFromRow(row);
  const close = numberValue(row.close);
  const ema50 = numberValue(row.ema_50);
  const ema150 = numberValue(row.ema_150);
  const ema200 = numberValue(row.ema_200);
  const ema200Slope = numberValue(row.ema_200_slope_30d);
  const sma50 = numberValue(row.sma_50);
  const sma150 = numberValue(row.sma_150);
  const sma200 = numberValue(row.sma_200);
  const avgVolume50d = numberValue(row.avg_volume_50d);
  const pricePerf6m = numberValue(row.price_perf_6m_pct);
  const checks: Array<[string, (value: number) => boolean]> = [
    ["price_min", (value) => result.close >= value],
    ["price_max", (value) => result.close <= value],
    ["pct_change_min", (value) => (result.pct_change ?? -Infinity) >= value],
    ["pct_change_max", (value) => (result.pct_change ?? Infinity) <= value],
    ["volume_min", (value) => result.volume >= value],
    ["volume_max", (value) => result.volume <= value],
    ["volume_ratio_min", (value) => (result.volume_ratio ?? -Infinity) >= value],
    ["volume_ratio_max", (value) => (result.volume_ratio ?? Infinity) <= value],
    ["turnover_min", (value) => (result.turnover ?? -Infinity) >= value],
    ["turnover_min_cr", (value) => (result.turnover_cr ?? -Infinity) >= value],
    ["rsi_min", (value) => (result.rsi_14 ?? -Infinity) >= value],
    ["rsi_max", (value) => (result.rsi_14 ?? Infinity) <= value],
    ["atr_min", (value) => (result.atr_14 ?? -Infinity) >= value],
    ["atr_max", (value) => (result.atr_14 ?? Infinity) <= value],
    ["w52h_pct_max", (value) => (result.week_52_high_pct ?? Infinity) <= value],
    ["week_52_high_pct_max", (value) => (result.week_52_high_pct ?? Infinity) <= value],
    ["w52l_pct_min", (value) => (result.week_52_low_pct ?? -Infinity) >= value],
    ["rs_score_min", (value) => (result.rs_score ?? -Infinity) >= value],
    ["rs_score_max", (value) => (result.rs_score ?? Infinity) <= value],
    ["price_perf_6m_min", (value) => (pricePerf6m ?? -Infinity) >= value],
    ["avg_volume_50d_min", (value) => (avgVolume50d ?? -Infinity) >= value],
    ["atr_pct_max", (value) => (result.atr_pct ?? Infinity) <= value],
  ];
  for (const [key, check] of checks) {
    const value = numberValue(filters[key]);
    if (value != null && !check(value)) return false;
  }
  if (filters.above_ema20 === true && !(result.ema_20 != null && result.close >= result.ema_20)) return false;
  if (filters.above_ema50 === true && !(result.ema_50 != null && result.close >= result.ema_50)) return false;
  if (filters.above_ema200 === true && !(result.ema_200 != null && result.close >= result.ema_200)) return false;
  if (filters.ema20_above_ema50 === true && !(result.ema_20 != null && result.ema_50 != null && result.ema_20 >= result.ema_50)) return false;
  if (filters.ema50_above_ema150 === true && !(ema50 != null && ema150 != null && ema50 > ema150)) return false;
  if (filters.ema150_above_ema200 === true && !(ema150 != null && ema200 != null && ema150 > ema200)) return false;
  if (filters.ema_200_trending_up === true && !(ema200Slope != null && ema200Slope > 0)) return false;
  if (filters.all_smas_bullish === true && (
    sma50 == null || sma150 == null || sma200 == null || close == null
    || close <= sma50 || !(sma50 > sma150 && sma150 > sma200)
  )) return false;
  if (filters.price_vs_sma50 === "above" && !(sma50 != null && close != null && close > sma50)) return false;
  if (filters.price_vs_sma50 === "below" && !(sma50 != null && close != null && close < sma50)) return false;
  if (filters.price_vs_sma150 === "above" && !(sma150 != null && close != null && close > sma150)) return false;
  if (filters.price_vs_sma150 === "below" && !(sma150 != null && close != null && close < sma150)) return false;
  if (filters.price_vs_sma200 === "above" && !(sma200 != null && close != null && close > sma200)) return false;
  if (filters.price_vs_sma200 === "below" && !(sma200 != null && close != null && close < sma200)) return false;
  if (filters.price_vs_ema50 === "above" && !(ema50 != null && close != null && close > ema50)) return false;
  if (filters.price_vs_ema50 === "below" && !(ema50 != null && close != null && close < ema50)) return false;
  if (filters.price_vs_ema150 === "above" && !(ema150 != null && close != null && close > ema150)) return false;
  if (filters.price_vs_ema150 === "below" && !(ema150 != null && close != null && close < ema150)) return false;
  if (filters.price_vs_ema200 === "above" && !(ema200 != null && close != null && close > ema200)) return false;
  if (filters.price_vs_ema200 === "below" && !(ema200 != null && close != null && close < ema200)) return false;
  if (filters.new_52w_high === true && !result.is_new_52w_high) return false;
  const series = Array.isArray(filters.series) ? filters.series.map(String) : [];
  if (series.length && !series.includes(result.series)) return false;
  const sectorFilter = filters.sector;
  const sectors = Array.isArray(sectorFilter)
    ? sectorFilter.map(String)
    : typeof sectorFilter === "string" && sectorFilter
      ? [sectorFilter]
      : [];
  if (sectors.length && (!result.sector || !sectors.includes(result.sector))) return false;
  return true;
}

function scanSortValue(row: DailyRow, key: string): number | null {
  const result = scanResultFromRow(row) as Record<string, unknown>;
  return numberValue(result[key]);
}

function unavailable(message: string, statusCode = 503) {
  return {
    status: "unavailable",
    mode: "unavailable",
    statusCode,
    message,
    detail: message,
    source_metadata: {
      source_name: "Vercel read-only recovery",
      mode: "fallback",
      as_of: null,
      generated_at: new Date().toISOString(),
      confidence: "unavailable",
      cache_status: "fallback",
      message,
    },
  };
}
