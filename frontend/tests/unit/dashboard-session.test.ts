import { describe, expect, it } from "vitest";
import { getDashboardSessionFocus } from "@/lib/dashboard-session";

const baseWorkflow = {
  accountIssues: [] as { id: string }[],
  alertIssues: [] as { id: string }[],
  closedTrades: 5,
  reviewedTrades: 5,
  watchlistReviewDue: 0,
  alertMatchSymbols: 0,
  scanAlerts: 0,
  trackedSymbols: 4,
  watchlists: 1,
};

describe("getDashboardSessionFocus", () => {
  it("prioritizes account data recovery", () => {
    const focus = getDashboardSessionFocus({
      ...baseWorkflow,
      accountIssues: [{ id: "journal" }],
    });
    expect(focus.primaryHref).toBe("/data");
    expect(focus.headline).toMatch(/Account data/i);
  });

  it("surfaces journal review debt before discovery", () => {
    const focus = getDashboardSessionFocus({
      ...baseWorkflow,
      reviewedTrades: 2,
    });
    expect(focus.primaryHref).toBe("/journal?review=needs-review");
    expect(focus.headline).toMatch(/3 closed trades need review/i);
  });

  it("routes clear workflows to scanner discovery", () => {
    const focus = getDashboardSessionFocus(baseWorkflow);
    expect(focus.primaryHref).toBe("/scanner");
    expect(focus.headline).toMatch(/discover setups/i);
  });
});
