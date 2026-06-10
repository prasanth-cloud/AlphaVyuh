export type ApiReachability = "unknown" | "ok" | "down";

export function isEodHealthUsable(status?: string | null): boolean {
  return status === "healthy" || status === "degraded" || status === "stale";
}

export function dataModePresentation({
  forceLive,
  demo,
  apiReachable,
  eodStatus,
  eodAsOf,
  liveQuotesUnavailable,
}: {
  forceLive: boolean;
  demo: boolean;
  apiReachable: ApiReachability;
  eodStatus?: string | null;
  eodAsOf?: string | null;
  liveQuotesUnavailable?: boolean;
}) {
  const eodUsable = isEodHealthUsable(eodStatus);
  const hardDown = apiReachable === "down" && !eodUsable;

  if (hardDown) {
    return {
      label: "Data API down",
      tone: "loss" as const,
      title: "Market data API is not reachable. Open Data Status for recovery details.",
    };
  }

  if (eodUsable && eodAsOf) {
    return {
      label: `EOD ${eodAsOf}`,
      tone: eodStatus === "healthy" ? ("muted" as const) : ("warn" as const),
      title: liveQuotesUnavailable
        ? `EOD data current as of ${eodAsOf}. Live intraday quotes are unavailable; scanner and charts use the latest completed session.`
        : `Latest completed market session: ${eodAsOf}. Scanner and charts use EOD data, not live intraday ticks.`,
    };
  }

  const label = forceLive ? "Provider data" : demo ? "Demo data" : "Latest session";
  const tone = forceLive ? ("gain" as const) : demo ? ("warn" as const) : ("muted" as const);
  const title = forceLive
    ? "Provider-data mode. Market data remains informational and requires source/freshness checks."
    : demo
      ? "Demo data mode. Charts and market views use deterministic sample data when market data is unavailable."
      : "Market data mode. Market views use the latest completed market snapshot, not live intraday data.";

  return { label, tone, title };
}
