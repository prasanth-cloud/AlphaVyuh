export function describeMarketDataError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("request timed out") ||
    lower.includes("network") ||
    lower.includes("application not found") ||
    lower.includes("404")
  ) {
    return "Live market data service is unavailable. Retry after the data API is restored, or open Data status for the latest source health.";
  }

  return message || "Failed to load market data.";
}
