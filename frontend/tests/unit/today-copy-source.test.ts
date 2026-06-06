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
    expect(todaySource).not.toContain("Dashboard workflow counts");
  });
});
