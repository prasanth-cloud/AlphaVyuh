import { describe, expect, it } from "vitest";
import { buildDashboardWorkflowFunnel } from "@/lib/dashboard-workflow-funnel";

const baseInput = {
  workflowStates: [],
  journalEntries: [],
  trackedSymbols: 5,
  watchlists: 1,
  watchlistReviewDue: 0,
  alertMatchSymbols: 7,
  scanAlerts: 2,
  openTrades: 0,
  closedTrades: 24,
  reviewedTrades: 24,
  knownUnreviewedTrades: 0,
  reviewCoveragePartial: false,
  accountIssueCount: 0,
  alertIssueCount: 0,
};

describe("dashboard workflow funnel", () => {
  it("uses same-cohort close-to-review coverage instead of an invalid discovery ratio", () => {
    const funnel = buildDashboardWorkflowFunnel(baseInput);

    expect(funnel.conversionLabel).toBe("100% close-to-review");
    expect(funnel.conversionLabel).not.toContain("discovery-to-close");
  });

  it("shows current discovery and historical close counts without turning them into a percentage", () => {
    const funnel = buildDashboardWorkflowFunnel({
      ...baseInput,
      reviewedTrades: 0,
      knownUnreviewedTrades: 24,
    });

    expect(funnel.conversionLabel).toBe("24 closed · 7 current discoveries");
  });
});
