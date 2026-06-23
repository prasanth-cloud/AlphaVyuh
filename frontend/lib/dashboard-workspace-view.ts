export type DashboardWorkspaceView = "session" | "full" | "discovery" | "risk" | "review";

export type DashboardWorkspaceSection =
  | "data"
  | "action"
  | "agenda"
  | "funnel"
  | "alerts"
  | "charts"
  | "scanner"
  | "validation"
  | "events"
  | "discipline"
  | "risk"
  | "journal"
  | "coach"
  | "import"
  | "broker"
  | "equity";

export type DashboardWorkspaceViewDefinition = {
  id: DashboardWorkspaceView;
  label: string;
  detail: string;
  sections: DashboardWorkspaceSection[];
};

const ALL_SECTIONS: DashboardWorkspaceSection[] = [
  "data",
  "action",
  "agenda",
  "funnel",
  "alerts",
  "charts",
  "scanner",
  "validation",
  "events",
  "discipline",
  "risk",
  "journal",
  "coach",
  "import",
  "broker",
  "equity",
];

export const DASHBOARD_WORKSPACE_VIEWS: DashboardWorkspaceViewDefinition[] = [
  {
    id: "session",
    label: "Session",
    detail: "Market, next actions, alerts, charts",
    sections: ["action", "agenda", "broker", "alerts", "charts"],
  },
  {
    id: "full",
    label: "Full desk",
    detail: "All dashboard cards",
    sections: ALL_SECTIONS,
  },
  {
    id: "discovery",
    label: "Discovery",
    detail: "Scanner, alerts, chart queue",
    sections: ["data", "action", "agenda", "funnel", "alerts", "charts", "scanner", "validation", "events", "discipline", "equity"],
  },
  {
    id: "risk",
    label: "Risk",
    detail: "Data, risk, import, P&L",
    sections: ["data", "action", "agenda", "funnel", "events", "discipline", "risk", "broker", "import", "equity"],
  },
  {
    id: "review",
    label: "Review",
    detail: "Journal, coach, scanner feedback",
    sections: ["data", "action", "agenda", "funnel", "scanner", "validation", "discipline", "journal", "coach", "equity"],
  },
];

const VIEW_IDS = new Set<DashboardWorkspaceView>(DASHBOARD_WORKSPACE_VIEWS.map((view) => view.id));

export function normalizeDashboardWorkspaceView(value: unknown): DashboardWorkspaceView {
  return typeof value === "string" && VIEW_IDS.has(value as DashboardWorkspaceView)
    ? value as DashboardWorkspaceView
    : "session";
}

export function getDashboardWorkspaceViewDefinition(
  value: unknown,
): DashboardWorkspaceViewDefinition {
  const view = normalizeDashboardWorkspaceView(value);
  return DASHBOARD_WORKSPACE_VIEWS.find((definition) => definition.id === view) ?? DASHBOARD_WORKSPACE_VIEWS[0];
}

export function getDashboardWorkspaceSections(value: unknown): Set<DashboardWorkspaceSection> {
  return new Set(getDashboardWorkspaceViewDefinition(value).sections);
}

export function shouldShowDashboardSection(
  value: unknown,
  section: DashboardWorkspaceSection,
): boolean {
  return getDashboardWorkspaceSections(value).has(section);
}
