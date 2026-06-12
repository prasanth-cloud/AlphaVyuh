import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync("app/(app)/dashboard/page.tsx", "utf8");
const marketDeskSource = readFileSync("components/dashboard/MarketOverviewDesk.tsx", "utf8");

describe("Dashboard page copy", () => {
  it("keeps sector taxonomy audit details out of the trader workflow", () => {
    expect(dashboardSource).not.toContain("sectorTaxonomyPresentation");
    expect(dashboardSource).not.toContain("dashboard-sector-taxonomy");
    expect(dashboardSource).not.toContain("Taxonomy");
    expect(marketDeskSource).toContain("Data Status");
    expect(dashboardSource).toMatch(/Data status/i);
  });

  it("focuses the dashboard on market overview and equity snapshot without session workflow chrome", () => {
    expect(dashboardSource).toContain("MarketOverviewDesk");
    expect(dashboardSource).toContain("DashboardEquitySnapshotCard");
    expect(dashboardSource).toContain("Dashboard needs the market data API");
    expect(dashboardSource).not.toContain("DashboardWorkflowSection");
    expect(dashboardSource).not.toContain("dashboard-workflow-toggle");
    expect(marketDeskSource).toContain("Live index quotes");
    expect(marketDeskSource).not.toContain("Latest completed session");
  });
});
