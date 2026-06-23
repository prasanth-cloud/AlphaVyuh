import { describe, expect, it } from "vitest";
import { buildDashboardDisciplineChecklist } from "@/lib/dashboard-discipline-checklist";

const baseInput = {
  marketDataStatus: "healthy" as const,
  accountIssueCount: 0,
  alertIssueCount: 0,
  trackedSymbols: 8,
  watchlistReviewDue: 0,
  openTrades: 0,
  closedTrades: 6,
  reviewedTrades: 6,
  knownUnreviewedTrades: 0,
  reviewCoveragePartial: false,
  brokerConnected: true,
  brokerCanImport: true,
  brokerTokenExpired: false,
  priceAlerts: 2,
  triggeredPriceAlerts: 0,
  eventFeedConnected: true,
};

describe("buildDashboardDisciplineChecklist", () => {
  it("marks all rules clear when data, focus, review, event, and import checks are ready", () => {
    const checklist = buildDashboardDisciplineChecklist(baseInput);

    expect(checklist.tone).toBe("ready");
    expect(checklist.score).toBe(100);
    expect(checklist.headline).toBe("Rules are clear");
    expect(checklist.primaryRule.id).toBe("data");
    expect(checklist.rules.map((rule) => rule.tone)).toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
      "ready",
      "ready",
    ]);
  });

  it("blocks discipline when data or alert evidence is not trustworthy", () => {
    const checklist = buildDashboardDisciplineChecklist({
      ...baseInput,
      marketDataStatus: "stale",
      alertIssueCount: 1,
    });

    expect(checklist.tone).toBe("warn");
    expect(checklist.primaryRule).toMatchObject({
      id: "data",
      value: "Check",
      href: "/data",
      tone: "warn",
    });
    expect(checklist.score).toBeLessThan(90);
  });

  it("pushes a pre-trade check when watchlist, open risk, review, and event rules need work", () => {
    const checklist = buildDashboardDisciplineChecklist({
      ...baseInput,
      trackedSymbols: 5,
      watchlistReviewDue: 2,
      openTrades: 1,
      closedTrades: 7,
      reviewedTrades: 5,
      knownUnreviewedTrades: 2,
      brokerConnected: false,
      brokerCanImport: false,
      eventFeedConnected: false,
    });

    expect(checklist.tone).toBe("action");
    expect(checklist.primaryRule).toMatchObject({
      id: "focus",
      tone: "action",
    });
    expect(checklist.rules.find((rule) => rule.id === "risk")).toMatchObject({
      value: "1 open plan",
      href: "/watchlist",
      tone: "action",
    });
    expect(checklist.rules.find((rule) => rule.id === "review")).toMatchObject({
      value: "2 due",
      href: "/journal?review=needs-review",
      tone: "action",
    });
    expect(checklist.rules.find((rule) => rule.id === "event")).toMatchObject({
      value: "Manual",
      href: "/data",
      tone: "action",
    });
    expect(checklist.rules.find((rule) => rule.id === "import")).toMatchObject({
      value: "Manual",
      href: "/settings/broker",
      tone: "action",
    });
  });

  it("starts the rules loop when no watchlist or closed-trade sample exists", () => {
    const checklist = buildDashboardDisciplineChecklist({
      ...baseInput,
      trackedSymbols: 0,
      priceAlerts: 0,
      closedTrades: 0,
      reviewedTrades: 0,
      knownUnreviewedTrades: 0,
      brokerConnected: false,
      brokerCanImport: false,
      eventFeedConnected: false,
    });

    expect(checklist.tone).toBe("action");
    expect(checklist.rules.find((rule) => rule.id === "focus")).toMatchObject({
      value: "Empty",
      href: "/scanner",
      tone: "empty",
    });
    expect(checklist.rules.find((rule) => rule.id === "review")).toMatchObject({
      value: "No sample",
      tone: "empty",
    });
  });

  it("treats an expired broker token as a warning even when the connection exists", () => {
    const checklist = buildDashboardDisciplineChecklist({
      ...baseInput,
      brokerTokenExpired: true,
    });

    expect(checklist.tone).toBe("warn");
    expect(checklist.primaryRule).toMatchObject({
      id: "import",
      value: "Reconnect",
      tone: "warn",
    });
  });
});
