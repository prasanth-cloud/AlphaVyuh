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

export function bhavcopyProvenancePresentation(health: DataHealth | null) {
  const bhavcopy = health?.last_bhavcopy;
  if (!bhavcopy?.status) {
    return { value: "NOT AVAILABLE", detail: "No bhavcopy ingest attempt recorded yet.", status: "bad" as const };
  }

  const rows = bhavcopy.rows_ingested ?? 0;
  const status = bhavcopy.status;
  const error = bhavcopy.error_message?.trim();
  const warning = bhavcopy.warning_message?.trim();

  if (status === "failed" || (error && rows === 0)) {
    return {
      value: "INGEST FAILED",
      detail: error || warning || "Latest bhavcopy attempt did not produce rows.",
      status: "bad" as const,
    };
  }

  if (status === "partial" || warning) {
    return {
      value: "PARTIAL",
      detail: `${rows.toLocaleString("en-IN")} rows ingested.${warning ? ` ${warning}` : ""}`,
      status: "warn" as const,
    };
  }

  return {
    value: status.toUpperCase(),
    detail: `${rows.toLocaleString("en-IN")} rows on ${bhavcopy.trade_date ?? "latest attempt"}.`,
    status: rows > 0 ? "good" as const : "warn" as const,
  };
}

export function indicatorCoveragePresentation(health: DataHealth | null) {
  const coverage = health?.indicator_coverage;
  const rsiMissing = coverage?.rsi_14_missing ?? health?.indicators_missing.rsi_14 ?? 0;
  const emaMissing = coverage?.ema_200_missing ?? health?.indicators_missing.ema_200 ?? 0;
  const total = coverage?.symbols_on_latest_date ?? health?.symbols_on_latest_date ?? null;

  if (total == null) {
    return {
      value: "NOT AVAILABLE",
      detail: "Indicator completeness cannot be confirmed right now.",
      status: "bad" as const,
    };
  }

  if (emaMissing <= 0 && rsiMissing <= 0) {
    return {
      value: "COMPLETE",
      detail: `RSI 14 and EMA 200 present for all ${total.toLocaleString("en-IN")} symbols on the latest session.`,
      status: "good" as const,
    };
  }

  const parts: string[] = [];
  if (emaMissing > 0) parts.push(`EMA 200 missing on ${emaMissing.toLocaleString("en-IN")} symbols`);
  if (rsiMissing > 0) parts.push(`RSI 14 missing on ${rsiMissing.toLocaleString("en-IN")} symbols`);

  return {
    value: emaMissing > 0 ? "EMA GAPS" : "RSI GAPS",
    detail: `${parts.join("; ")} on the latest session. Scanner presets using these filters may be narrower until backfill completes.`,
    status: "warn" as const,
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
      detail: "Market data API is unreachable. Dashboard, scanner, watchlist charts, and full chart are waiting for service recovery.",
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
