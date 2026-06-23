import { describe, expect, it } from "vitest";
import { buildDashboardSessionAgenda, getDashboardSessionFocus } from "@/lib/dashboard-session";

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

  it("does not invent full-history review debt when only a partial journal sample is loaded", () => {
    const focus = getDashboardSessionFocus({
      ...baseWorkflow,
      closedTrades: 24,
      reviewedTrades: 24,
      knownUnreviewedTrades: 0,
      reviewCoveragePartial: true,
    });
    expect(focus.headline).toMatch(/discover setups/i);
    expect(focus.streakValue).toBe("Recent");
    expect(focus.streakDetail).toMatch(/loaded journal sample/i);
  });

  it("routes clear workflows to scanner discovery", () => {
    const focus = getDashboardSessionFocus(baseWorkflow);
    expect(focus.primaryHref).toBe("/scanner");
    expect(focus.headline).toMatch(/discover setups/i);
  });

  it("builds an ordered agenda from data gates, alerts, symbols, watchlist, and journal work", () => {
    const agenda = buildDashboardSessionAgenda({
      ...baseWorkflow,
      accountIssues: [{ id: "journal" }],
      alertMatchSymbols: 2,
      watchlistReviewDue: 3,
      knownUnreviewedTrades: 1,
      reviewCoveragePartial: true,
      openTrades: 1,
      brokerConnected: false,
      prioritySymbols: [{
        symbol: "DIXON",
        label: "Review next",
        reason: "Pinned",
        href: "/watchlist?id=leaders&symbol=DIXON",
        chartHref: "/charts/DIXON?from=dashboard&full=1",
      }],
    });

    expect(agenda.primaryItem.id).toBe("data");
    expect(agenda.items.map((item) => item.id)).toEqual(["data", "alerts", "symbol", "watchlist", "journal"]);
    expect(agenda.items.find((item) => item.id === "symbol")?.href).toBe("/charts/DIXON?from=dashboard&full=1");
  });

  it("falls back to scanner discovery when the desk has no active blockers", () => {
    const agenda = buildDashboardSessionAgenda(baseWorkflow);
    expect(agenda.primaryItem).toMatchObject({
      id: "scanner",
      href: "/scanner",
    });
  });
});
