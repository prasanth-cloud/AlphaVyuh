import type { ApiReachability } from "./data-mode";
import { isEodHealthUsable } from "./data-mode";
import type { DataHealth } from "./api/types";

type MarketHealth = {
  status?: "healthy" | "degraded" | "stale" | "unknown" | string | null;
  latest_trade_date?: string | null;
};

export type MarketPanelKind = "sector-breadth" | "movers";

export function getMarketPanelEmptyCopy(options: {
  panel: MarketPanelKind;
  dataHealth: DataHealth | null;
  marketError?: string;
  hasSessionDate: boolean;
}): { message: string; tone: "neutral" | "warn"; testId?: string } {
  const panelLabel = options.panel === "sector-breadth" ? "Sector breadth" : "Top movers";

  if (options.marketError?.trim()) {
    return {
      message: `${panelLabel} is temporarily unavailable while market summary recovers. Open Data Status for the latest ingest state.`,
      tone: "warn",
      testId: `dashboard-${options.panel}-unavailable`,
    };
  }

  if (options.dataHealth?.status === "degraded") {
    return {
      message: `${panelLabel} may be incomplete while market data ingest is degraded. Confirm freshness in Data Status before acting on rankings.`,
      tone: "warn",
      testId: `dashboard-${options.panel}-degraded`,
    };
  }

  if (options.dataHealth?.status === "stale" || options.dataHealth?.status === "unknown") {
    return {
      message: `${panelLabel} is waiting on a fresher market session. Check Data Status if this persists beyond the latest EOD refresh.`,
      tone: "warn",
      testId: `dashboard-${options.panel}-stale`,
    };
  }

  if (!options.hasSessionDate) {
    return {
      message: `${panelLabel} is waiting for the latest market session date.`,
      tone: "warn",
      testId: `dashboard-${options.panel}-pending`,
    };
  }

  return {
    message: options.panel === "sector-breadth"
      ? "No sector breakdown returned for the latest session yet."
      : "No top movers returned for the latest session yet.",
    tone: "neutral",
  };
}

export function marketDataHealthPresentation(health: MarketHealth | null, apiReachable: ApiReachability) {
  if (health && isEodHealthUsable(health.status)) {
    const liveProbeFailed = apiReachable === "down";
    return {
      value: health.status ? health.status.toUpperCase() : "CHECK DATA",
      detail: health.latest_trade_date
        ? `Latest complete trade date ${health.latest_trade_date}.${liveProbeFailed ? " Live quote probe failed, but EOD ingest responded." : ""}`
        : `EOD ingest responded.${liveProbeFailed ? " Live quote probe failed." : ""}`,
      status: health.status === "healthy" ? "good" as const : "warn" as const,
    };
  }

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
