import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync("app/(app)/dashboard/page.tsx", "utf8");

describe("dashboard page source", () => {
  it("defers background workflow hydration until the browser has idle time", () => {
    expect(dashboardSource).toContain("scheduleDashboardBackgroundHydration");
    expect(dashboardSource).toContain("requestIdleCallback");
    expect(dashboardSource).toContain("timeout: 900");
    expect(dashboardSource).toContain("dashboard-background-hydration-complete");
    expect(dashboardSource).not.toContain("const timer = window.setTimeout(() => {");
  });

  it("warms dashboard priority charts after the cockpit is interactive", () => {
    expect(dashboardSource).toContain("prefetchCandles");
    expect(dashboardSource).toContain("prefetchedPriorityChartsRef");
    expect(dashboardSource).toContain("priorityChartSymbolsKey");
    expect(dashboardSource).toContain("getWatchlistChartRequest('3M')");
    expect(dashboardSource).toContain("workflow.prioritySymbols.slice(0, 4).forEach((item) => prefetchCandles(item.symbol, params))");
    expect(dashboardSource).toContain("dashboard-priority-chart-prefetch");
  });

  it("renders the workflow funnel as part of the cockpit contract", () => {
    expect(dashboardSource).toContain("DashboardWorkflowFunnel");
    expect(dashboardSource).toContain("visibleDashboardSections.has('funnel')");
    expect(dashboardSource).toContain("workflowStates={workflow.workflowStates}");
    expect(dashboardSource).toContain("knownUnreviewedTrades={workflow.knownUnreviewedTrades}");
  });

  it("surfaces broker lifecycle attention in the focused cockpit", () => {
    expect(dashboardSource).toContain("getBrokerOrderActivity(25)");
    expect(dashboardSource).toContain("DashboardBrokerFlightStatus");
    expect(dashboardSource).toContain("visibleDashboardSections.has('broker')");
    expect(dashboardSource).toContain("orders={workflow.brokerOrders}");
    expect(dashboardSource).toContain("unavailable={workflow.brokerActivityUnavailable}");
  });

  it("loads non-session cockpit modules on demand", () => {
    expect(dashboardSource).toContain("import dynamic from 'next/dynamic'");
    expect(dashboardSource).toContain("const DashboardDataConfidence = dynamic(");
    expect(dashboardSource).toContain("const DashboardRiskControl = dynamic(");
    expect(dashboardSource).toContain("const DashboardJournalEdge = dynamic(");
    expect(dashboardSource).toContain("const DashboardImportReconciliation = dynamic(");
    expect(dashboardSource).not.toContain("import { DashboardDataConfidence } from");
    expect(dashboardSource).not.toContain("import { DashboardRiskControl } from");
  });
});
