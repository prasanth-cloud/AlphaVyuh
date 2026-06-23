import { describe, expect, it } from "vitest";
import { buildDashboardChartWorkbench } from "@/lib/dashboard-chart-workbench";

const baseInput = {
  marketDataStatus: "healthy" as const,
  alertIssueCount: 0,
  priceAlerts: 0,
  triggeredPriceAlerts: 0,
  topAlertSymbols: [],
  prioritySymbols: [],
  trackedSymbols: 0,
  watchlistReviewDue: 0,
  openTrades: 0,
};

describe("buildDashboardChartWorkbench", () => {
  it("starts from the scanner when no chart queue exists", () => {
    const workbench = buildDashboardChartWorkbench(baseInput);

    expect(workbench.tone).toBe("empty");
    expect(workbench.headline).toMatch(/build/i);
    expect(workbench.primaryAction).toMatchObject({
      id: "next",
      href: "/scanner",
      tone: "empty",
    });
    expect(workbench.symbols).toEqual([]);
  });

  it("gates chart review when alert context is unavailable", () => {
    const workbench = buildDashboardChartWorkbench({
      ...baseInput,
      alertIssueCount: 1,
      topAlertSymbols: [
        { symbol: "DIXON", href: "/charts/DIXON?from=dashboard-alerts&full=1" },
      ],
    });

    expect(workbench.tone).toBe("warn");
    expect(workbench.primaryAction).toMatchObject({
      id: "next",
      value: "Unavailable",
      href: "/data",
      tone: "warn",
    });
  });

  it("routes the next chart to a priority symbol full-chart review", () => {
    const workbench = buildDashboardChartWorkbench({
      ...baseInput,
      prioritySymbols: [{
        symbol: "PERSISTENT",
        label: "Review next",
        reason: "Pinned and strong setup",
        href: "/watchlist?id=leaders&symbol=PERSISTENT",
        chartHref: "/charts/PERSISTENT?from=dashboard&full=1",
      }],
    });

    expect(workbench.tone).toBe("action");
    expect(workbench.primaryAction).toMatchObject({
      id: "next",
      value: "PERSISTENT",
      href: "/charts/PERSISTENT?from=dashboard&full=1",
      tone: "action",
    });
    expect(workbench.symbols.map((symbol) => symbol.symbol)).toEqual(["PERSISTENT"]);
  });

  it("builds a multi-chart board from priority and alert candidates", () => {
    const workbench = buildDashboardChartWorkbench({
      ...baseInput,
      prioritySymbols: [{
        symbol: "DIXON",
        label: "Review next",
        reason: "Pinned and strong setup",
        href: "/watchlist?id=leaders&symbol=DIXON",
        chartHref: "/charts/DIXON?from=dashboard&full=1",
      }],
      topAlertSymbols: [
        { symbol: "DIXON", href: "/charts/DIXON?from=dashboard-alerts&full=1" },
        { symbol: "CAMS", href: "/charts/CAMS?from=dashboard-alerts&full=1" },
      ],
    });

    const board = workbench.items.find((item) => item.id === "board");
    expect(workbench.symbols.map((symbol) => symbol.symbol)).toEqual(["DIXON", "CAMS"]);
    expect(board).toMatchObject({
      value: "2-symbol",
      tone: "action",
    });
    expect(board?.href).toContain("/charts?");
    expect(decodeURIComponent(board?.href ?? "")).toContain("symbols=DIXON,CAMS");
    expect(board?.href).toContain("layout=2-up");
  });

  it("surfaces triggered chart levels as an action", () => {
    const workbench = buildDashboardChartWorkbench({
      ...baseInput,
      priceAlerts: 3,
      triggeredPriceAlerts: 2,
    });

    expect(workbench.tone).toBe("action");
    expect(workbench.primaryAction).toMatchObject({
      id: "levels",
      value: "2 hit",
      href: "/alerts",
      tone: "action",
    });
  });

  it("uses watchlist review debt as chart context action", () => {
    const workbench = buildDashboardChartWorkbench({
      ...baseInput,
      trackedSymbols: 5,
      watchlistReviewDue: 2,
      priceAlerts: 1,
    });

    expect(workbench.tone).toBe("action");
    expect(workbench.items.find((item) => item.id === "context")).toMatchObject({
      value: "2 due",
      href: "/watchlist",
      tone: "action",
    });
  });
});
