/** Display name for a symbol — blank when metadata repeats the ticker. */
export function displayCompanyName(
  symbol: string,
  companyName: string | null | undefined,
): string {
  const name = companyName?.trim();
  if (!name) return "";
  if (name.toUpperCase() === symbol.trim().toUpperCase()) return "";
  return name;
}

export const FUNDAMENTALS_UNAVAILABLE_TOOLTIP =
  "Fundamentals not available for this symbol";

export const SCANNER_FUNDAMENTAL_COLUMN_IDS = new Set([
  "pe_ratio",
  "pb_ratio",
  "roe",
  "roce",
  "eps",
  "dividend_yield",
  "market_cap_cr",
]);

/** Core valuation ratios shown in the screener list view. */
export const SCANNER_CORE_FUNDAMENTAL_COLUMN_IDS = [
  "pe_ratio",
  "pb_ratio",
  "roe",
  "roce",
] as const;

type FundamentalRow = Partial<
  Record<(typeof SCANNER_CORE_FUNDAMENTAL_COLUMN_IDS)[number], number | null | undefined>
>;

/** True when all core fundamental columns are empty for a scan row. */
export function symbolMissingCoreFundamentals(row: FundamentalRow): boolean {
  return SCANNER_CORE_FUNDAMENTAL_COLUMN_IDS.every((id) => row[id] == null);
}

export function countResultsMissingCoreFundamentals(
  results: FundamentalRow[],
): number {
  return results.filter(symbolMissingCoreFundamentals).length;
}
