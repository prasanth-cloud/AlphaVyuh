import { describe, expect, it } from "vitest";
import {
  buildChartPlanDraft,
  buildWorkflowPatchFromChartDraft,
  calculateRiskReward,
  parseChartPlanDraft,
} from "@/lib/chart-plan-handoff";

describe("chart plan handoff", () => {
  it("builds a rich chart plan draft with setup context and risk metadata", () => {
    const draft = buildChartPlanDraft({
      symbol: "aubank",
      side: "long",
      entry: 640.125,
      stop: 620,
      target: 680,
      timeframe: "D",
      drawingId: "draw-1",
      setupLabel: "Breakout watch",
      playbookScore: 82.4,
      readyChecks: ["Trend: Price above EMA stack", "Volume: 1.8x average"],
      createdAt: "2026-05-20T00:00:00.000Z",
    });

    expect(draft).toMatchObject({
      symbol: "AUBANK",
      side: "long",
      entry: 640.13,
      stop: 620,
      target: 680,
      setupLabel: "Breakout watch",
      playbookScore: 82,
      readyChecks: ["Trend: Price above EMA stack", "Volume: 1.8x average"],
      riskReward: 1.98,
    });
    expect(draft?.thesis).toContain("Chart plan: Breakout watch on D");
    expect(draft?.thesis).toContain("Ready checks: Trend: Price above EMA stack, Volume: 1.8x average.");
    expect(draft?.invalidationRule).toBe("Invalidate if price breaches the drawn stop below 620.");
  });

  it("rejects invalid risk geometry", () => {
    expect(calculateRiskReward(100, 95, 115)).toBe(3);
    expect(buildChartPlanDraft({
      symbol: "RELIANCE",
      side: "long",
      entry: 100,
      stop: 105,
      target: 120,
      timeframe: "D",
      drawingId: "bad",
      setupLabel: "Breakout watch",
      playbookScore: 80,
      readyChecks: [],
    })).toBeNull();
  });

  it("turns a draft into a watchlist workflow patch for Decision Desk review", () => {
    const draft = buildChartPlanDraft({
      symbol: "INFY",
      side: "short",
      entry: 1500,
      stop: 1530,
      target: 1440,
      timeframe: "W",
      drawingId: "short-1",
      setupLabel: "Reversal watch",
      playbookScore: 60,
      readyChecks: ["Momentum: RSI 38"],
      createdAt: "2026-05-20T00:00:00.000Z",
    });
    expect(draft).not.toBeNull();

    const patch = buildWorkflowPatchFromChartDraft(draft!, "wl-1");

    expect(patch).toMatchObject({
      symbol: "INFY",
      watchlist_id: "wl-1",
      source: "chart",
      lifecycle: "watch",
      setup_type: "reversal",
      entry: 1500,
      stop: 1530,
      target: 1440,
      timeframe: "W",
      confidence: 3,
      setup_quality: 3,
      tags: ["chart-plan", "short", "W"],
    });
    expect(patch.thesis).toContain("Reversal watch");
    expect(patch.invalidation_rule).toBe("Invalidate if price breaches the drawn stop above 1530.");
  });

  it("parses only complete handoff drafts for the expected symbol", () => {
    const draft = buildChartPlanDraft({
      symbol: "TCS",
      side: "long",
      entry: 3900,
      stop: 3800,
      target: 4200,
      timeframe: "D",
      drawingId: "draw-2",
      setupLabel: "Pullback watch",
      playbookScore: 75,
      readyChecks: [],
      createdAt: "2026-05-20T00:00:00.000Z",
    });

    expect(parseChartPlanDraft(JSON.stringify(draft), "TCS")?.riskReward).toBe(3);
    expect(parseChartPlanDraft(JSON.stringify(draft), "INFY")).toBeNull();
    expect(parseChartPlanDraft("not-json", "TCS")).toBeNull();
  });
});
