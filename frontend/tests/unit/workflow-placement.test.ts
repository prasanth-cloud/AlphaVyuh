import { describe, expect, it } from "vitest";

import {
  TRADER_WORKFLOW_STEPS,
  WORKFLOW_FLOW_CAPTION,
  getChartWorkflowLinks,
  getChartWorkflowNextStep,
  getJournalWorkflowLinks,
  getWorkflowDeskMeta,
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
    expect(resolveAppRouteLabel("/analytics")).toBe("Market Pulse");
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

  it("exposes a five-step desk flow caption", () => {
    expect(WORKFLOW_FLOW_CAPTION).toBe("Dashboard → Scanner → Watchlist → Chart → Journal");
  });

  it("exposes chart workflow chip links with optional plan-trade handoff", () => {
    expect(getChartWorkflowLinks()).toEqual([
      { label: "Scanner", href: "/scanner" },
      { label: "Watchlist", href: "/watchlist" },
      { label: "Journal", href: "/journal" },
    ]);
    expect(getChartWorkflowLinks({ planTradeHref: "/watchlist?symbol=RELIANCE&planDraft=chart" })).toEqual([
      { label: "Scanner", href: "/scanner" },
      { label: "Watchlist", href: "/watchlist" },
      { label: "Journal", href: "/journal" },
      { label: "Plan trade", href: "/watchlist?symbol=RELIANCE&planDraft=chart", active: true },
    ]);
    expect(getChartWorkflowNextStep()).toEqual({
      label: "Open journal review",
      href: "/journal?review=needs-review",
    });
  });

  it("exposes journal workflow footer links when a symbol is in focus", () => {
    expect(getJournalWorkflowLinks()).toEqual([{ label: "Back to watchlist", href: "/watchlist" }]);
    expect(getJournalWorkflowLinks("INFY")).toEqual([
      { label: "Back to watchlist", href: "/watchlist" },
      { label: "Open chart", href: "/charts/INFY" },
    ]);
  });

  it("maps desk routes to subtitles and forward next-step CTAs", () => {
    expect(getWorkflowDeskMeta("/scanner")).toMatchObject({
      title: "Scanner",
      nextStep: { label: "Open watchlist", href: "/watchlist" },
    });
    expect(getWorkflowDeskMeta("/watchlist")).toMatchObject({
      title: "Watchlist",
      nextStep: { label: "Plan on chart", href: "/charts" },
    });
    expect(getWorkflowDeskMeta("/journal")?.title).toBe("Journal");
    expect(getWorkflowDeskMeta("/charts/RELIANCE")?.nextStep).toEqual({
      label: "Open journal review",
      href: "/journal?review=needs-review",
    });
  });
});
