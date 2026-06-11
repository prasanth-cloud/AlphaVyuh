/**
 * Shared trader workflow copy and friendly route labels for public + signed-in surfaces.
 */

export type TraderWorkflowStep = {
  title: string;
  body: string;
};

/** Canonical desk flow: Dashboard → Scanner → Watchlist → Chart → Journal */
export const TRADER_WORKFLOW_STEPS: TraderWorkflowStep[] = [
  {
    title: "Dashboard",
    body: "Start each session with review due, data health, watchlist focus, and what to do next.",
  },
  {
    title: "Scanner",
    body: "Run EOD presets after checking freshness, then send matches to your watchlist.",
  },
  {
    title: "Watchlist",
    body: "Work the analysis desk — notes, chart preview, and Decision Desk for symbols under review.",
  },
  {
    title: "Chart & Decision Desk",
    body: "Plan levels, thesis, and invalidation with indicators and source context attached.",
  },
  {
    title: "Journal review",
    body: "Capture simulated or imported trades and review what your process proved on closed trades.",
  },
];

const APP_ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/scanner": "Scanner",
  "/watchlist": "Watchlist",
  "/journal": "Journal",
  "/data": "Data Status",
  "/upload": "Upload",
  "/onboarding": "Onboarding",
  "/alerts": "Alerts",
  "/settings": "Settings",
  "/settings/broker": "Broker settings",
  "/settings/billing": "Billing",
};

export const SIGNED_IN_NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scanner", label: "Scanner" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/journal", label: "Journal" },
] as const;

export function resolveAppRouteLabel(path: string): string {
  const [pathname] = path.split("?");
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (APP_ROUTE_LABELS[normalized]) return APP_ROUTE_LABELS[normalized];
  if (normalized.startsWith("/charts")) return "Chart";
  if (normalized.startsWith("/settings")) return "Settings";
  return normalized;
}
