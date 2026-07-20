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
    expect(dashboardSource).toContain("workflow.prioritySymbols.slice(0, 2).forEach((item) => prefetchCandles(item.symbol, params))");
    expect(dashboardSource).toContain("dashboard-priority-chart-prefetch");
  });

  it("renders one coherent three-part decision surface", () => {
    expect(dashboardSource).toContain("MarketOverviewDesk");
    expect(dashboardSource).toContain("DashboardActionBrief");
    expect(dashboardSource).not.toContain("FirstRunBanner");
    expect(dashboardSource).not.toContain("DashboardWorkspaceSwitcher");
    expect(dashboardSource).not.toContain("DashboardSessionAgenda");
    expect(dashboardSource).not.toContain("visibleDashboardSections");
    expect(dashboardSource).not.toContain("import dynamic from 'next/dynamic'");
  });

  it("does not infer unseen journal trades were reviewed", () => {
    expect(dashboardSource).toContain("isCompletedProcessReview(entry)");
    expect(dashboardSource).toContain("reviewedTrades: reviewedClosedTradesInSample");
    expect(dashboardSource).not.toContain("Boolean(entry.lessons?.trim())");
    expect(dashboardSource).not.toContain("closedTrades - knownUnreviewedTrades");
  });

  it("keeps cached market failures visible instead of silently suppressing them", () => {
    expect(dashboardSource).toContain("setError(describeMarketDataError(e))");
    expect(dashboardSource).toContain("marketRefreshFailed={Boolean(error)}");
    expect(dashboardSource).not.toContain("if (!dataRef.current)");
  });

  it("keeps failed refresh evidence until a later request succeeds and contains workflow-state failures", () => {
    expect(dashboardSource).not.toContain("DASHBOARD_SNAPSHOT_CACHE_KEY");
    expect(dashboardSource).not.toContain("window.localStorage");
    expect(dashboardSource.indexOf("const snapshot = await getMarketSnapshot()")).toBeLessThan(dashboardSource.indexOf("setError('')"));
    expect(dashboardSource).toContain("getWorkflowStatesForSymbols(Array.from(trackedSymbolSet))");
    expect(dashboardSource).toContain("'Workflow context is temporarily unavailable.'");
    expect(dashboardSource).toContain("workflowStatesResult.issue");
  });

  it("keeps pending and unavailable account evidence distinct from empty workflow state", () => {
    expect(dashboardSource).toContain("const [workflowLoading, setWorkflowLoading] = useState(true)");
    expect(dashboardSource).toContain("workflowLoading={workflowLoading}");
    expect(dashboardSource).toContain("watchlistUnavailable: Boolean(watchlistsResult.issue)");
    expect(dashboardSource).toContain("workflowContextUnavailable: Boolean(workflowStatesResult.issue)");
    expect(dashboardSource).toContain("journalUnavailable: Boolean(journalResult.issue || statsResult.issue)");
    expect(dashboardSource).toContain("brokerUnavailable: Boolean(brokerResult.issue)");
  });
});
