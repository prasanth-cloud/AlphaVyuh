import { describe, expect, it } from "vitest";
import { getDecisionMemorySummary, getReviewContext, getTradeFlowMeta } from "@/app/(app)/journal/components/utils";

describe("journal review context", () => {
  it("builds process prompts from the original scanner idea and plan", () => {
    const context = getReviewContext({
      entry_reason: "Scanner: Trend Template | Matched: Volume expansion | Thesis: Breakout holding | Invalidation: Close below base",
      status: "closed",
      lessons: null,
      setup_type: "breakout",
      risk_reward: 2.5,
      pnl: 1200,
      holding_days: 4,
      source_page: "watchlist",
      source_context: "Launch QA",
      thesis: "Breakout holding above prior resistance.",
      invalidation_rule: "Close below the base.",
      scanner_context: {
        source: "scanner",
        preset_name: "Trend Template",
        match_reasons: ["Volume expansion"],
        setup_grade: "A",
        setup_score: 84,
        data_as_of: "2026-05-15",
      },
    });

    expect(context.hasContext).toBe(true);
    expect(context.summary).toEqual(expect.arrayContaining([
      { label: "Original scan", value: "Trend Template" },
      { label: "Matched reason", value: "Volume expansion" },
      { label: "Original thesis", value: "Breakout holding above prior resistance." },
      { label: "Outcome", value: "Gain ₹1,200 · 4D hold" },
      { label: "Process focus", value: "High-score setup worked" },
    ]));
    expect(context.prompts.join(" ")).toContain("Scanner score 84 with positive outcome");
    expect(context.prompts.join(" ")).toContain("What changed between entry and exit?");
    expect(context.prompts.join(" ")).not.toMatch(/should|buy|sell|recommend/i);
  });

  it("turns high-quality losing setups into process review prompts", () => {
    const context = getReviewContext({
      entry_reason: "Scanner: Stage 2",
      status: "closed",
      lessons: null,
      setup_type: "stage 2",
      risk_reward: 2.2,
      pnl: -900,
      holding_days: 1,
      source_page: "scanner",
      source_context: "Scanner result",
      thesis: "Breakout from a tight base.",
      invalidation_rule: "Close below pivot.",
      scanner_context: {
        source: "scanner",
        preset_name: "Stage 2 Breakout",
        match_reasons: ["Close above pivot"],
        setup_grade: "A",
        setup_score: 86,
        data_as_of: "2026-05-20",
      },
    });

    expect(context.summary).toEqual(expect.arrayContaining([
      { label: "Outcome", value: "Loss -₹900 · 1D hold" },
      { label: "Process focus", value: "High-score setup failed" },
    ]));
    expect(context.prompts.join(" ")).toContain("Scanner score 86 with negative outcome");
    expect(context.prompts.join(" ")).toContain("Planned R:R was 1:2.2, but the outcome was negative");
    expect(context.prompts.join(" ")).not.toMatch(/should|buy|sell|recommend/i);
  });

  it("falls back quietly when original context is missing", () => {
    const context = getReviewContext({
      entry_reason: null,
      status: "closed",
      lessons: null,
      setup_type: null,
      risk_reward: null,
      pnl: -300,
      holding_days: 2,
      source_page: null,
      source_context: null,
      thesis: null,
      invalidation_rule: null,
      scanner_context: null,
    });

    expect(context.hasContext).toBe(false);
    expect(context.fallback).toMatch(/Original idea context was not captured/i);
  });

  it("labels journal capture watchlist orders without parsing them as manual logs", () => {
    expect(getTradeFlowMeta({
      entry_reason: "[Simulated · watchlist]",
      status: "open",
      lessons: null,
      source_page: "watchlist",
    })).toMatchObject({
      sourceLabel: "Watchlist plan",
      brokerLabel: "Journal capture",
      autoRecorded: true,
    });
  });

  it("uses saved lessons as the reviewed marker for closed trades", () => {
    expect(getTradeFlowMeta({
      entry_reason: "Chart order",
      status: "open",
      lessons: "Already drafted",
      source_page: "chart",
    })).toMatchObject({ reviewLabel: "Open" });

    expect(getTradeFlowMeta({
      entry_reason: "Manual log",
      status: "closed",
      lessons: "   ",
      source_page: "manual",
    })).toMatchObject({ reviewLabel: "Needs review", reviewTone: "warn" });

    expect(getTradeFlowMeta({
      entry_reason: "Manual log",
      status: "closed",
      lessons: "Wait for confirmation.",
      source_page: "manual",
    })).toMatchObject({ reviewLabel: "Reviewed", reviewTone: "gain" });
  });

  it("summarizes decision memory coverage without adding trade advice", () => {
    const summary = getDecisionMemorySummary([
      {
        entry_reason: "Scanner: Trend Template",
        status: "closed",
        lessons: "Waited for volume confirmation.",
        source_page: "scanner",
        source_context: "Trend Template",
        scanner_context: { source: "scanner", preset_name: "Trend Template", match_reasons: ["Volume expansion"], setup_score: 82 },
        thesis: "Breakout continuation.",
        invalidation_rule: "Close below pivot.",
      },
      {
        entry_reason: "[Simulated · watchlist]",
        status: "closed",
        lessons: "",
        source_page: "watchlist",
        source_context: "Priority watchlist",
        scanner_context: null,
        thesis: "Sector leader pullback.",
        invalidation_rule: null,
      },
      {
        entry_reason: "Zerodha import",
        status: "closed",
        lessons: null,
        source_page: "manual",
        source_context: "Zerodha upload",
        scanner_context: null,
        thesis: null,
        invalidation_rule: null,
      },
    ]);

    expect(summary).toMatchObject({
      status: "needs-review",
      coveragePct: 33,
      closedTrades: 3,
      reviewedTrades: 1,
      decisionContextCount: 3,
      sourceCounts: {
        scanner: 1,
        watchlist: 1,
        chart: 0,
        broker: 1,
        manual: 0,
      },
    });
    expect(`${summary.headline} ${summary.nextAction}`).not.toMatch(/should|buy|sell|recommend/i);
  });

  it("marks decision memory ready only after the review sample is fully covered", () => {
    const summary = getDecisionMemorySummary([
      { entry_reason: "Chart order", status: "closed", lessons: "Good stop discipline.", source_page: "chart", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Manual log", status: "closed", lessons: "Entry was late.", source_page: "manual", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Scanner: Stage 2", status: "closed", lessons: "Volume faded.", source_page: "scanner", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
    ]);

    expect(summary).toMatchObject({
      status: "ready",
      coveragePct: 100,
      decisionContextCount: 2,
    });
  });

  it("keeps unavailable journal state distinct from an empty journal", () => {
    expect(getDecisionMemorySummary([], { unavailable: true })).toMatchObject({
      status: "unavailable",
      headline: "Decision memory unavailable",
      coveragePct: 0,
      closedTrades: 0,
      reviewedTrades: 0,
    });

    expect(getDecisionMemorySummary([])).toMatchObject({
      status: "build-sample",
      headline: "Build a 3-trade review sample",
      nextAction: "Close 3 more trades with entry plan context.",
    });
  });
});
