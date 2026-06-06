type AlertStatus = "waiting" | "success" | "skipped" | "failed";

export type ScanAlertIntent = {
  label: string;
  detail: string;
  tone: "entry" | "exit" | "review";
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isTruthyFilter(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

function isBelowFilter(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "below";
}

export function describeScanAlertIntent(filters: Record<string, unknown> | null | undefined): ScanAlertIntent {
  const safeFilters = filters ?? {};
  const pctChangeMax = asNumber(safeFilters.pct_change_max);
  const rsiMax = asNumber(safeFilters.rsi_max);
  const adxMin = asNumber(safeFilters.adx_min);
  const week52HighPctMax = asNumber(safeFilters.week_52_high_pct_max);
  const rsScoreMin = asNumber(safeFilters.rs_score_min);
  const volumeRatioMin = asNumber(safeFilters.volume_ratio_min);
  const pctChangeMin = asNumber(safeFilters.pct_change_min);

  const exitRisk =
    (pctChangeMax != null && pctChangeMax < 0) ||
    (rsiMax != null && rsiMax <= 45) ||
    isBelowFilter(safeFilters.price_vs_ema50) ||
    isBelowFilter(safeFilters.price_vs_ema200) ||
    isBelowFilter(safeFilters.price_vs_sma50) ||
    isTruthyFilter(safeFilters.new_52w_low);

  if (exitRisk) {
    return {
      label: "Exit / risk review",
      detail: "Flags cash-equity names that may need trim, stop, or invalidation review after the EOD scan.",
      tone: "exit",
    };
  }

  const entrySetup =
    isTruthyFilter(safeFilters.new_52w_high) ||
    isTruthyFilter(safeFilters.vcp_contraction) ||
    isTruthyFilter(safeFilters.all_smas_bullish) ||
    (pctChangeMin != null && pctChangeMin > 0) ||
    (volumeRatioMin != null && volumeRatioMin >= 1.5) ||
    (rsScoreMin != null && rsScoreMin >= 60) ||
    (week52HighPctMax != null && week52HighPctMax <= 25) ||
    (adxMin != null && adxMin >= 20);

  if (entrySetup) {
    return {
      label: "Entry setup watch",
      detail: "Tracks cash-equity setups that may deserve chart review, shortlist, or watchlist action.",
      tone: "entry",
    };
  }

  return {
    label: "Review watch",
    detail: "Tracks this saved cash-equity screen once fresh EOD data is available.",
    tone: "review",
  };
}

export function describeScanAlertCadence(alert: {
  is_active: boolean;
  last_run_status?: AlertStatus;
}): string {
  if (!alert.is_active) return "Paused: this screen will not run after the next completed EOD session.";
  if (alert.last_run_status === "failed") return "Active: retries after the next completed EOD session when alert data is available.";
  if (alert.last_run_status === "skipped") return "Active: waits for the next complete cash-equity EOD session.";
  return "Active: checks once after each completed cash-equity EOD session.";
}
