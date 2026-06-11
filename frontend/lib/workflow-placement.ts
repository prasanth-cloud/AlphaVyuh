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

/** Short flow caption for desk headers and dashboard copy. */
export const WORKFLOW_FLOW_CAPTION = "Dashboard → Scanner → Watchlist → Chart → Journal";

export type WorkflowDeskRoute = "/dashboard" | "/scanner" | "/watchlist" | "/journal";

export type WorkflowDeskMeta = {
  eyebrow: string;
  title: string;
  subtitle: string;
  nextStep?: { label: string; href: string };
};

const DESK_ROUTE_INDEX: Record<WorkflowDeskRoute, number> = {
  "/dashboard": 0,
  "/scanner": 1,
  "/watchlist": 2,
  "/journal": 4,
};

const DESK_NEXT_STEP: Record<WorkflowDeskRoute, { label: string; href: string }> = {
  "/dashboard": { label: "Open scanner", href: "/scanner" },
  "/scanner": { label: "Open watchlist", href: "/watchlist" },
  "/watchlist": { label: "Plan on chart", href: "/charts" },
  "/journal": { label: "Back to dashboard", href: "/dashboard" },
};

const NAV_TITLES: Record<WorkflowDeskRoute, string> = {
  "/dashboard": "Dashboard",
  "/scanner": "Scanner",
  "/watchlist": "Watchlist",
  "/journal": "Journal",
};

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

/** Desk page header copy + forward workflow CTA for signed-in surfaces. */
export function getWorkflowDeskMeta(pathname: string): WorkflowDeskMeta | null {
  const normalized = pathname.replace(/\/$/, "") || "/";

  if (normalized.startsWith("/charts")) {
    return {
      eyebrow: "Chart",
      title: "Chart",
      subtitle: TRADER_WORKFLOW_STEPS[3].body,
      nextStep: { label: "Open journal review", href: "/journal?review=needs-review" },
    };
  }

  if (!(normalized in DESK_ROUTE_INDEX)) return null;

  const route = normalized as WorkflowDeskRoute;
  const step = TRADER_WORKFLOW_STEPS[DESK_ROUTE_INDEX[route]];

  return {
    eyebrow: NAV_TITLES[route],
    title: NAV_TITLES[route],
    subtitle: step.body,
    nextStep: DESK_NEXT_STEP[route],
  };
}
