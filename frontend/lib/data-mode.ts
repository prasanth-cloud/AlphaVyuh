export type ApiReachability = "unknown" | "ok" | "down";

export function dataModePresentation({
  forceLive,
  demo,
  apiReachable,
}: {
  forceLive: boolean;
  demo: boolean;
  apiReachable: ApiReachability;
}) {
  const down = apiReachable === "down";
  const label = down ? "Data API down" : forceLive ? "Provider data" : demo ? "Demo data" : "Latest session";
  const tone = down ? "loss" : forceLive ? "gain" : demo ? "warn" : "muted";
  const title = down
    ? "Market data API is not reachable. Open Data Status for recovery details."
    : forceLive
      ? "Provider-data mode. Market data remains informational and requires source/freshness checks."
      : demo
        ? "Demo data mode. Charts and market views use deterministic sample data when market data is unavailable."
        : "Market data mode. Market views use the latest completed market snapshot, not live intraday data.";

  return { label, tone, title };
}
