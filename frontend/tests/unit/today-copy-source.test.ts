import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todaySource = readFileSync("app/(app)/dashboard/page.tsx", "utf8");

describe("Today page copy", () => {
  it("keeps sector taxonomy audit details out of the trader workflow", () => {
    expect(todaySource).not.toContain("sectorTaxonomyPresentation");
    expect(todaySource).not.toContain("dashboard-sector-taxonomy");
    expect(todaySource).not.toContain("Taxonomy");
    expect(todaySource).toContain("Data Status");
  });

  it("uses Today as the user-facing dashboard label", () => {
    expect(todaySource).toContain("Today workflow counts are paused");
    expect(todaySource).toContain("Today needs the backend data API");
    expect(todaySource).toContain("Today&apos;s workflow");
    expect(todaySource).toContain("Scan alert matches");
    expect(todaySource).toContain("Watchlist review");
    expect(todaySource).toContain("Journal review debt");
    expect(todaySource).toContain("Broker import status");
    expect(todaySource).toContain("getWorkflowStates");
    expect(todaySource).toContain("WORKFLOW_STATE_SYMBOL_BATCH_SIZE");
    expect(todaySource).toContain("setupBlockingAccountIssues");
    expect(todaySource).toContain("alertIssues");
    expect(todaySource).toContain("is_active");
    expect(todaySource).toContain("review_later");
    expect(todaySource).toContain("Open pattern review");
    expect(todaySource).toContain("/journal?tab=ai");
    expect(todaySource).not.toContain("Dashboard workflow counts");
    expect(todaySource).not.toContain("Open AI review");
  });
});
