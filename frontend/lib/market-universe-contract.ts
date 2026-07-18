export const MARKET_UNIVERSE_CONTRACT = {
  schema_version: 1,
  id: "nse_active_eq",
  label: "Active NSE equity universe",
  market: "NSE",
  series: ["EQ"],
  active_only: true,
  session_basis: "latest_complete_eod_session",
  numerator: "distinct_symbols_with_valid_eod_row",
  denominator: "active_stock_universe_symbols",
  complete_session_min_coverage_pct: 75,
  healthy_coverage_pct: 90,
} as const;

export function buildMarketUniverseEvidence(symbolsCount?: number | null, universeActive?: number | null) {
  const observed = symbolsCount ?? null;
  const eligible = universeActive ?? null;
  const coveragePct = observed != null && eligible && eligible > 0
    ? Number(((observed / eligible) * 100).toFixed(1))
    : null;

  return {
    ...MARKET_UNIVERSE_CONTRACT,
    symbols_count: observed,
    universe_active: eligible,
    coverage_pct: coveragePct,
  };
}
