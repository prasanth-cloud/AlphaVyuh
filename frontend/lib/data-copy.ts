export function formatMarketDataSource(source?: string | null, fallback = "Market data") {
  const normalized = source?.trim();
  if (!normalized) return fallback;
  const lower = normalized.toLowerCase();
  if (lower.includes("bhavcopy")) return "Exchange market data";
  if (lower.includes("mock") || lower.includes("fixture")) return "Demo data";
  if (lower.includes("yahoo")) return "Provider market data";
  if (lower.includes("kite") || lower.includes("zerodha")) return "Broker market data";
  return normalized;
}

export function formatMarketDataMode(mode?: string | null, isMockMode = false) {
  const normalized = mode?.toLowerCase();
  if (isMockMode || normalized === "demo") return "demo";
  if (normalized === "fallback" || normalized === "unknown" || normalized === "unavailable") return "check data";
  if (normalized === "live") return "updating";
  return "market";
}
