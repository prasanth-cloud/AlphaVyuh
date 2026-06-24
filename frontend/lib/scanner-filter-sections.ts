export type ScannerFilterSectionId =
  | "price-change"
  | "liquidity"
  | "trend-quality"
  | "relative-strength"
  | "setup-structure"
  | "volatility-risk"
  | "week-range"
  | "candle-patterns"
  | "market-cap"
  | "valuation"
  | "returns-efficiency"
  | "dividends-debt";

type SectionDef = {
  id: ScannerFilterSectionId;
  title: string;
  tab: "technicals" | "fundamentals";
  keys: string[];
};

export const SCANNER_FILTER_SECTIONS: SectionDef[] = [
  { id: "price-change", title: "Price and change", tab: "technicals", keys: ["price_min", "price_max", "pct_change_min", "pct_change_max"] },
  { id: "liquidity", title: "Liquidity", tab: "technicals", keys: ["volume_ratio_min", "volume_ratio_max"] },
  {
    id: "trend-quality",
    title: "Trend quality",
    tab: "technicals",
    keys: [
      "price_vs_ema20", "price_vs_ema50", "price_vs_ema150", "price_vs_ema200",
      "price_vs_sma50", "price_vs_sma150", "price_vs_sma200",
      "ema20_vs_ema50", "ema50_vs_ema200", "ema50_above_ema150", "ema150_above_ema200",
      "all_emas_bullish", "all_smas_bullish",
    ],
  },
  { id: "relative-strength", title: "Relative strength", tab: "technicals", keys: ["rsi_min", "rsi_max", "adx_min", "adx_max", "macd_hist_positive"] },
  {
    id: "setup-structure",
    title: "Setup structure",
    tab: "technicals",
    keys: ["vcp_contraction", "vcp_min_pivots", "vcp_max_depth_pct", "vcp_pivot_proximity_pct", "bb_position", "bb_width_min", "bb_width_max"],
  },
  { id: "volatility-risk", title: "Volatility and risk", tab: "technicals", keys: ["atr_pct_min", "atr_pct_max"] },
  {
    id: "week-range",
    title: "52-week range",
    tab: "technicals",
    keys: ["week_52_high_pct_max", "w52l_pct_min", "rs_score_min", "new_52w_high", "new_52w_low"],
  },
  { id: "candle-patterns", title: "Candle patterns", tab: "technicals", keys: ["is_inside_bar"] },
  { id: "market-cap", title: "Market cap", tab: "fundamentals", keys: ["market_cap_min", "market_cap_max"] },
  { id: "valuation", title: "Valuation", tab: "fundamentals", keys: ["pe_min", "pe_max", "pb_min", "pb_max", "eps_min", "eps_max"] },
  { id: "returns-efficiency", title: "Returns and efficiency", tab: "fundamentals", keys: ["roe_min", "roce_min"] },
  { id: "dividends-debt", title: "Dividends & Debt", tab: "fundamentals", keys: ["dividend_yield_min", "dividend_yield_max", "debt_to_equity_max"] },
];

const STORAGE_PREFIX = "alphavyuh-scanner-filter-section:";

export function readScannerFilterSectionOpen(sectionId: ScannerFilterSectionId): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${sectionId}`);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeScannerFilterSectionOpen(sectionId: ScannerFilterSectionId, open: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${sectionId}`, open ? "1" : "0");
  } catch {
    // local preference only
  }
}

export function countActiveFiltersInSection(
  filters: Record<string, unknown>,
  empty: Record<string, unknown>,
  keys: string[],
): number {
  let count = 0;
  for (const key of keys) {
    const current = filters[key];
    const baseline = empty[key];
    if (typeof current === "boolean") {
      if (current !== baseline) count += 1;
    } else if (Array.isArray(current)) {
      if (JSON.stringify(current) !== JSON.stringify(baseline)) count += 1;
    } else if (current !== baseline) {
      count += 1;
    }
  }
  return count;
}
