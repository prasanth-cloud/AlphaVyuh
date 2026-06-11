import { describe, expect, it } from "vitest";

import {
  TRADER_WORKFLOW_STEPS,
  resolveAppRouteLabel,
  SIGNED_IN_NAV_LINKS,
} from "@/lib/workflow-placement";

describe("workflow placement", () => {
  it("orders the public workflow as Dashboard → Scanner → Watchlist → Chart → Journal", () => {
    expect(TRADER_WORKFLOW_STEPS.map((step) => step.title)).toEqual([
      "Dashboard",
      "Scanner",
      "Watchlist",
      "Chart & Decision Desk",
      "Journal review",
    ]);
  });

  it("maps protected routes to friendly labels for auth redirect copy", () => {
    expect(resolveAppRouteLabel("/scanner")).toBe("Scanner");
    expect(resolveAppRouteLabel("/dashboard")).toBe("Dashboard");
    expect(resolveAppRouteLabel("/watchlist")).toBe("Watchlist");
    expect(resolveAppRouteLabel("/journal?review=needs-review")).toBe("Journal");
    expect(resolveAppRouteLabel("/charts/RELIANCE")).toBe("Chart");
  });

  it("orders signed-in nav as Dashboard, Scanner, Watchlist, Journal", () => {
    expect(SIGNED_IN_NAV_LINKS.map((link) => link.label)).toEqual([
      "Dashboard",
      "Scanner",
      "Watchlist",
      "Journal",
    ]);
  });
});
