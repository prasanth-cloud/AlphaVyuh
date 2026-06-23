import { describe, expect, it } from "vitest";
import { buildDashboardAlertPlanner } from "@/lib/dashboard-alert-planner";

const baseInput = {
  marketDataStatus: "healthy" as const,
  alertIssueCount: 0,
  scanAlerts: 2,
  alertMatchSymbols: 0,
  priceAlerts: 2,
  triggeredPriceAlerts: 0,
  latestScanRunDate: "2026-06-12",
  latestScanAlertName: "Trend Template",
  latestScanMatchCount: 0,
  topAlertSymbols: [],
  trackedSymbols: 8,
  watchlistReviewDue: 0,
  openTrades: 0,
  brokerConnected: true,
  prioritySymbols: [],
};

describe("buildDashboardAlertPlanner", () => {
  it("marks an armed alert loop as ready", () => {
    const planner = buildDashboardAlertPlanner(baseInput);

    expect(planner.tone).toBe("ready");
    expect(planner.headline).toMatch(/ready/i);
    expect(planner.primaryAction.id).toBe("scan-alerts");
  });

  it("gates the alert loop when alert services are unavailable", () => {
    const planner = buildDashboardAlertPlanner({
      ...baseInput,
      alertIssueCount: 1,
      alertMatchSymbols: 5,
    });

    expect(planner.tone).toBe("warn");
    expect(planner.primaryAction).toMatchObject({
      id: "scan-alerts",
      href: "/alerts",
      tone: "warn",
    });
  });

  it("surfaces fresh scan matches and direct chart symbols", () => {
    const planner = buildDashboardAlertPlanner({
      ...baseInput,
      alertMatchSymbols: 3,
      latestScanMatchCount: 6,
      topAlertSymbols: [
        { symbol: "DIXON", href: "/charts/DIXON?from=dashboard-alerts&full=1" },
        { symbol: "CAMS", href: "/charts/CAMS?from=dashboard-alerts&full=1" },
      ],
    });

    expect(planner.tone).toBe("action");
    expect(planner.primaryAction.id).toBe("scan-alerts");
    expect(planner.items.find((item) => item.id === "scan-alerts")?.detail).toContain("Trend Template");
    expect(planner.topSymbols.map((symbol) => symbol.symbol)).toEqual(["DIXON", "CAMS"]);
  });

  it("prioritizes triggered chart price levels when no scan match is waiting", () => {
    const planner = buildDashboardAlertPlanner({
      ...baseInput,
      scanAlerts: 1,
      alertMatchSymbols: 0,
      triggeredPriceAlerts: 2,
    });

    expect(planner.tone).toBe("action");
    expect(planner.primaryAction).toMatchObject({
      id: "price-alerts",
      href: "/alerts",
      tone: "action",
    });
  });

  it("routes the next candidate to its chart when priority symbols exist", () => {
    const planner = buildDashboardAlertPlanner({
      ...baseInput,
      scanAlerts: 0,
      priceAlerts: 0,
      prioritySymbols: [{
        symbol: "PERSISTENT",
        label: "Review next",
        reason: "Pinned and strong setup",
        href: "/watchlist?id=leaders&symbol=PERSISTENT",
        chartHref: "/charts/PERSISTENT?from=dashboard&full=1",
      }],
    });

    const candidate = planner.items.find((item) => item.id === "candidate");
    expect(candidate).toMatchObject({
      value: "PERSISTENT",
      href: "/charts/PERSISTENT?from=dashboard&full=1",
      tone: "action",
    });
  });

  it("uses Data Status as the primary action when market freshness is not trustworthy", () => {
    const planner = buildDashboardAlertPlanner({
      ...baseInput,
      marketDataStatus: "stale",
    });

    expect(planner.tone).toBe("warn");
    expect(planner.primaryAction).toMatchObject({
      id: "automation",
      href: "/data",
      tone: "warn",
    });
  });
});
