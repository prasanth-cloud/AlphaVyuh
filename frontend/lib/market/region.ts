import type { MarketRegion } from "@/lib/market/types";

const US_COUNTRIES = new Set(["US", "CA", "GB", "UK"]);

export function normalizeRegion(value: string | null | undefined): MarketRegion {
  if (!value) return "IN";
  return value.toUpperCase() === "US" ? "US" : "IN";
}

export function regionFromCountry(countryCode: string | null | undefined): MarketRegion {
  if (!countryCode) return "IN";
  return US_COUNTRIES.has(countryCode.toUpperCase()) ? "US" : "IN";
}
