import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WORKSPACE_VIEWS,
  getDashboardWorkspaceViewDefinition,
  normalizeDashboardWorkspaceView,
  shouldShowDashboardSection,
} from "@/lib/dashboard-workspace-view";

describe("dashboard workspace view presets", () => {
  it("uses the focused session cockpit as the safe default", () => {
    expect(normalizeDashboardWorkspaceView(null)).toBe("session");
    expect(normalizeDashboardWorkspaceView("unknown")).toBe("session");
    expect(getDashboardWorkspaceViewDefinition("session").sections).toEqual([
      "action",
      "agenda",
      "broker",
      "alerts",
      "charts",
    ]);
  });

  it("keeps the full desk available for deep review", () => {
    expect(getDashboardWorkspaceViewDefinition("full").sections).toEqual([
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
    ]);
  });

  it("keeps discovery focused on scanner-to-chart decisions", () => {
    expect(shouldShowDashboardSection("discovery", "alerts")).toBe(true);
    expect(shouldShowDashboardSection("discovery", "charts")).toBe(true);
    expect(shouldShowDashboardSection("discovery", "scanner")).toBe(true);
    expect(shouldShowDashboardSection("discovery", "validation")).toBe(true);
    expect(shouldShowDashboardSection("discovery", "events")).toBe(true);
    expect(shouldShowDashboardSection("discovery", "discipline")).toBe(true);
    expect(shouldShowDashboardSection("discovery", "journal")).toBe(false);
    expect(shouldShowDashboardSection("discovery", "import")).toBe(false);
  });

  it("keeps risk focused on data, import, guardrails, and P&L", () => {
    expect(shouldShowDashboardSection("risk", "data")).toBe(true);
    expect(shouldShowDashboardSection("risk", "risk")).toBe(true);
    expect(shouldShowDashboardSection("risk", "events")).toBe(true);
    expect(shouldShowDashboardSection("risk", "discipline")).toBe(true);
    expect(shouldShowDashboardSection("risk", "import")).toBe(true);
    expect(shouldShowDashboardSection("risk", "broker")).toBe(true);
    expect(shouldShowDashboardSection("risk", "equity")).toBe(true);
    expect(shouldShowDashboardSection("risk", "alerts")).toBe(false);
    expect(shouldShowDashboardSection("risk", "coach")).toBe(false);
  });

  it("keeps review focused on journal learning and scanner feedback", () => {
    expect(shouldShowDashboardSection("review", "journal")).toBe(true);
    expect(shouldShowDashboardSection("review", "coach")).toBe(true);
    expect(shouldShowDashboardSection("review", "scanner")).toBe(true);
    expect(shouldShowDashboardSection("review", "validation")).toBe(true);
    expect(shouldShowDashboardSection("review", "discipline")).toBe(true);
    expect(shouldShowDashboardSection("review", "charts")).toBe(false);
    expect(shouldShowDashboardSection("review", "import")).toBe(false);
  });

  it("has unique, named presets for the switcher", () => {
    const ids = DASHBOARD_WORKSPACE_VIEWS.map((view) => view.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DASHBOARD_WORKSPACE_VIEWS.map((view) => view.label)).toEqual([
      "Session",
      "Full desk",
      "Discovery",
      "Risk",
      "Review",
    ]);
  });
});
