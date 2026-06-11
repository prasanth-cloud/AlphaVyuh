import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync("app/(app)/dashboard/page.tsx", "utf8");

describe("Dashboard page copy", () => {
  it("keeps sector taxonomy audit details out of the trader workflow", () => {
    expect(dashboardSource).not.toContain("sectorTaxonomyPresentation");
    expect(dashboardSource).not.toContain("dashboard-sector-taxonomy");
    expect(dashboardSource).not.toContain("Taxonomy");
    expect(dashboardSource).toContain("Data Status");
  });

  it("uses Dashboard as the user-facing workflow checkpoint label", () => {
    expect(dashboardSource).toContain("Dashboard workflow counts are paused");
    expect(dashboardSource).toContain("Dashboard needs the backend data API");
    expect(dashboardSource).toContain("Session summary");
    expect(dashboardSource).toContain("getDashboardSessionFocus");
    expect(dashboardSource).toContain('data-testid="dashboard-session-cta"');
    expect(dashboardSource).toContain("Scan alert matches");
    expect(dashboardSource).toContain("Watchlist review");
    expect(dashboardSource).toContain("Journal review debt");
    expect(dashboardSource).toContain("Broker import status");
    expect(dashboardSource).toContain("getWorkflowStates");
    expect(dashboardSource).toContain("WORKFLOW_STATE_SYMBOL_BATCH_SIZE");
    expect(dashboardSource).toContain("setupBlockingAccountIssues");
    expect(dashboardSource).toContain("alertIssues");
    expect(dashboardSource).toContain("is_active");
    expect(dashboardSource).toContain("review_later");
    expect(dashboardSource).toContain("Open pattern review");
    expect(dashboardSource).toContain("/journal?tab=ai");
    expect(dashboardSource).not.toContain("Today&apos;s workflow");
    expect(dashboardSource).not.toContain("Open AI review");
  });
});
