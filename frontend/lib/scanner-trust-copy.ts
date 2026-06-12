export type ScanTrustMode = "demo" | "eod" | "fallback" | "live" | "unknown";

export function scannerTrustBannerVisible(mode: ScanTrustMode): boolean {
  return mode === "live" || mode === "eod" || mode === "demo";
}
