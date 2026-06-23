import { describe, expect, it } from "vitest";
import { buildDashboardDataConfidence } from "@/lib/dashboard-data-confidence";

const baseInput = {
  marketDataStatus: "healthy" as const,
  marketDataMode: "live",
  tradeDate: "2026-06-12",
  latestTradeDate: "2026-06-12",
  hoursSinceRefresh: 2,
  coveragePct: 98,
  symbolsOnLatestDate: 2145,
  universeActive: 2170,
  fallbackActive: false,
  marketError: null,
  accountIssueCount: 0,
  alertIssueCount: 0,
  closedTrades: 8,
  knownUnreviewedTrades: 0,
  reviewCoveragePartial: false,
  trackedSymbols: 12,
  scanAlerts: 2,
  alertMatchSymbols: 0,
  brokerConnected: true,
  brokerStatusLabel: "Connected",
  brokerLastSyncedAt: "2026-06-12T16:00:00Z",
};

describe("buildDashboardDataConfidence", () => {
  it("marks a complete desk as ready for planning", () => {
    const confidence = buildDashboardDataConfidence(baseInput);

    expect(confidence.tone).toBe("ready");
    expect(confidence.score).toBeGreaterThanOrEqual(82);
    expect(confidence.headline).toMatch(/ready/i);
    expect(confidence.primaryAction.id).toBe("market");
  });

  it("gates planning when market freshness is degraded", () => {
    const confidence = buildDashboardDataConfidence({
      ...baseInput,
      marketDataStatus: "degraded",
    });

    expect(confidence.tone).toBe("warn");
    expect(confidence.primaryAction).toMatchObject({
      id: "market",
      href: "/data",
      tone: "warn",
    });
  });

  it("surfaces fallback coverage as a scanner trust risk", () => {
    const confidence = buildDashboardDataConfidence({
      ...baseInput,
      fallbackActive: true,
      coveragePct: 62,
    });

    const coverage = confidence.checks.find((check) => check.id === "coverage");
    expect(confidence.tone).toBe("warn");
    expect(coverage).toMatchObject({
      value: "Fallback",
      href: "/data",
      tone: "warn",
    });
  });

  it("routes account service failures to Data Status before workflow actions", () => {
    const confidence = buildDashboardDataConfidence({
      ...baseInput,
      accountIssueCount: 2,
      alertIssueCount: 1,
    });

    expect(confidence.primaryAction).toMatchObject({
      id: "account",
      href: "/data",
      tone: "warn",
    });
    expect(confidence.checks.find((check) => check.id === "alerts")?.tone).toBe("warn");
  });

  it("keeps partial reviewed journal samples as review-needed, not fully ready", () => {
    const confidence = buildDashboardDataConfidence({
      ...baseInput,
      reviewCoveragePartial: true,
    });

    const journal = confidence.checks.find((check) => check.id === "journal");
    expect(confidence.tone).toBe("action");
    expect(journal).toMatchObject({
      value: "Partial",
      tone: "action",
      href: "/journal?tab=analytics",
    });
  });

  it("keeps unreviewed closed trades ahead of scanner work", () => {
    const confidence = buildDashboardDataConfidence({
      ...baseInput,
      knownUnreviewedTrades: 3,
      alertMatchSymbols: 4,
    });

    const journal = confidence.checks.find((check) => check.id === "journal");
    expect(journal).toMatchObject({
      value: "3 due",
      href: "/journal?review=needs-review",
      tone: "action",
    });
    expect(confidence.primaryAction.id).toBe("journal");
  });
});
