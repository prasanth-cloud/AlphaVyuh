import type { ScanTrustMode } from "@/lib/scanner-trust-copy";

type ScannerTrustBannerProps = {
  mode: ScanTrustMode;
  asOf: string | null;
  source: string;
};

export function ScannerTrustBanner({ mode, asOf, source }: ScannerTrustBannerProps) {
  if (mode !== "live" && mode !== "eod" && mode !== "demo") return null;

  const isLive = mode === "live";
  const label = isLive
    ? "Live session data"
    : mode === "demo"
      ? "Demo data mode"
      : "End-of-day data";
  const copy = isLive
    ? "Scanner results use live intraday quotes. Confirm source freshness in Data Status before acting."
    : mode === "demo"
      ? "Scanner is using deterministic demo data for development and QA."
      : `Scanner uses the latest completed NSE session${asOf ? ` (${asOf})` : ""}. Not live intraday ticks.`;

  return (
    <div
      className={`scanner-trust-banner${isLive ? " scanner-trust-banner-live" : ""}`}
      data-testid="scanner-trust-banner"
      title={`Source: ${source}`}
    >
      <span className="scanner-trust-banner-label">{label}</span>
      <span className="scanner-trust-banner-copy">{copy}</span>
      <a className="scanner-trust-banner-link" href="/data">
        Data Status
      </a>
    </div>
  );
}
