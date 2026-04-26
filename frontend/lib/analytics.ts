type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    va?: (event: string, properties?: AnalyticsProperties) => void;
  }
}

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined") return;
  window.va?.(name, properties);
  window.gtag?.("event", name, properties);
}
