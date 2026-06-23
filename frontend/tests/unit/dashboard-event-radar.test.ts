import { describe, expect, it } from "vitest";
import type { DashboardPrioritySymbol } from "@/lib/dashboard-action-brief";
import { buildDashboardEventRadar } from "@/lib/dashboard-event-radar";

const baseInput = {
  marketDataStatus: "healthy" as const,
  marketDataMode: "eod",
  tradeDate: "2026-06-12",
  latestTradeDate: "2026-06-12",
  hoursSinceRefresh: 2,
  trackedSymbols: 0,
  watchlistReviewDue: 0,
  openTrades: 0,
  scanAlerts: 0,
  alertMatchSymbols: 0,
  priceAlerts: 0,
  triggeredPriceAlerts: 0,
  accountIssueCount: 0,
  alertIssueCount: 0,
  prioritySymbols: [] as DashboardPrioritySymbol[],
};

function prioritySymbol(overrides: Partial<DashboardPrioritySymbol> = {}): DashboardPrioritySymbol {
  return {
    symbol: "DIXON",
    companyName: "Dixon Technologies",
    watchlistId: "wl-1",
    watchlistName: "Breakouts",
    label: "Chart",
    score: 82,
    reason: "Review-later flag",
    detail: "Needs chart and event check",
    href: "/watchlist?symbol=DIXON",
    chartHref: "/charts/DIXON?from=dashboard",
    ...overrides,
  };
}

describe("buildDashboardEventRadar", () => {
  it("gates event review when freshness or alert evidence is unavailable", () => {
    const radar = buildDashboardEventRadar({
      ...baseInput,
      marketDataStatus: "stale",
      alertIssueCount: 1,
      trackedSymbols: 4,
    });

    expect(radar.tone).toBe("warn");
    expect(radar.primaryAction).toMatchObject({
      id: "freshness",
      href: "/data",
      tone: "warn",
    });
    expect(radar.items.find((item) => item.id === "plan")).toMatchObject({
      value: "Blocked",
      tone: "warn",
    });
  });

  it("surfaces the missing calendar feed as a manual check when exposure exists", () => {
    const radar = buildDashboardEventRadar({
      ...baseInput,
      trackedSymbols: 8,
      watchlistReviewDue: 2,
      openTrades: 1,
      alertMatchSymbols: 3,
      prioritySymbols: [prioritySymbol()],
    });

    expect(radar.tone).toBe("action");
    expect(radar.items.find((item) => item.id === "calendar")).toMatchObject({
      value: "Not wired",
      tone: "action",
    });
    expect(radar.items.find((item) => item.id === "plan")).toMatchObject({
      value: "Manual check",
      href: "/journal",
      tone: "action",
    });
    expect(radar.symbols).toEqual([
      {
        symbol: "DIXON",
        label: "Chart",
        detail: "Review-later flag",
        href: "/charts/DIXON?from=dashboard",
      },
    ]);
  });

  it("starts with scanner focus when there is no event review queue yet", () => {
    const radar = buildDashboardEventRadar(baseInput);

    expect(radar.tone).toBe("empty");
    expect(radar.primaryAction).toMatchObject({
      id: "calendar",
      value: "Not wired",
      tone: "empty",
    });
    expect(radar.items.find((item) => item.id === "exposure")).toMatchObject({
      value: "No queue",
      href: "/scanner",
      tone: "empty",
    });
  });

  it("supports a future connected event feed without changing the dashboard contract", () => {
    const radar = buildDashboardEventRadar({
      ...baseInput,
      eventFeedConnected: true,
      upcomingEventsCount: 2,
      trackedSymbols: 5,
    });

    expect(radar.tone).toBe("action");
    expect(radar.items.find((item) => item.id === "calendar")).toMatchObject({
      value: "2 events",
      href: "/watchlist",
      tone: "action",
    });
    expect(radar.items.find((item) => item.id === "plan")).toMatchObject({
      value: "Plan events",
      tone: "action",
    });
  });
});
