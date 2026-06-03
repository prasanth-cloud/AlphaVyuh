import type { ApiReachability } from "./data-mode";

type MarketHealth = {
  status?: "healthy" | "degraded" | "stale" | "unknown" | string | null;
  latest_trade_date?: string | null;
};

export function marketDataHealthPresentation(health: MarketHealth | null, apiReachable: ApiReachability) {
  if (apiReachable === "down") {
    return {
      value: "DATA API DOWN",
      detail: "Market data API is unreachable. Today, scanner, watchlist charts, and full chart are waiting for service recovery.",
      status: "bad" as const,
    };
  }

  if (!health) {
    return {
      value: "CHECK DATA",
      detail: "Freshness details are not available right now.",
      status: "bad" as const,
    };
  }

  return {
    value: health.status ? health.status.toUpperCase() : "CHECK DATA",
    detail: health.latest_trade_date
      ? `Latest complete trade date ${health.latest_trade_date}.`
      : "Freshness details are not available right now.",
    status: health.status === "healthy" ? "good" as const : health.status === "degraded" ? "warn" as const : "bad" as const,
  };
}
