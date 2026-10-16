import { describe, expect, it } from "vitest";
import { displayEntryReason, getDecisionMemorySummary, getJournalReviewStage, getReviewContext, getTradeFlowMeta } from "@/app/(app)/journal/components/utils";

describe("journal review context", () => {
  it("hides internal order-intent markers from trader-facing copy", () => {
    expect(displayEntryReason(
      "Breakout above pivot [Simulated · Chart] [alphavyuh-order-intent:11111111-1111-4111-8111-111111111111]",
    )).toBe("Breakout above pivot [Simulated · Chart]");
  });

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
        captured_price: 2847.5,
        captured_change_pct: 4.72,
        captured_volume_ratio: 1.87,
      },
    });

    expect(context.hasContext).toBe(true);
    expect(context.summary).toEqual(expect.arrayContaining([
      { label: "Original scan", value: "Trend Template" },
      { label: "Matched reason", value: "Volume expansion" },
      { label: "Original thesis", value: "Breakout holding above prior resistance." },
      { label: "Captured price", value: "₹2,847.50 · +4.72% · 1.87x volume" },
      { label: "Outcome", value: "Gain ₹1,200 · 4D hold" },
      { label: "Process focus", value: "High-score setup worked" },
    ]));
    expect(context.prompts.join(" ")).toContain("Did this trade follow the recorded thesis and invalidation");
    expect(context.prompts.join(" ")).toContain("What leaked edge in this trade");
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

  it("keeps fallback details when source context is only plumbing", () => {
    const context = getReviewContext({
      entry_reason: "Chart order with stop and target",
      status: "closed",
      lessons: null,
      setup_type: null,
      risk_reward: 1.8,
      pnl: -250,
      holding_days: 2,
      source_page: "chart",
      source_context: "SBIN chart",
      thesis: null,
      invalidation_rule: null,
      scanner_context: null,
    });

    expect(context.hasContext).toBe(false);
    expect(context.summary).toEqual(expect.arrayContaining([{ label: "Source", value: "Chart order" }]));
    expect(context.summary).not.toEqual(expect.arrayContaining([{ label: "Outcome", value: expect.any(String) }]));
    expect(context.fallback).toMatch(/entry, stop, target, exit, P&L, and notes/i);
  });

  it("does not treat manual source-only trades as original idea context", () => {
    const context = getReviewContext({
      entry_reason: "Manual log",
      status: "closed",
      lessons: null,
      setup_type: null,
      risk_reward: null,
      pnl: 450,
      holding_days: 3,
      source_page: "manual",
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

  it("uses explicit process-review fields as the reviewed marker for closed trades", () => {
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
      lessons: "Legacy or AI-authored lesson.",
      source_page: "manual",
    })).toMatchObject({ reviewLabel: "Needs review", reviewTone: "warn" });

    expect(getTradeFlowMeta({
      entry_reason: "Manual log",
      status: "closed",
      lessons: "Legacy lesson remains separate.",
      review_schema_version: 1,
      setup_adherence: "followed",
      review_lesson: "Wait for confirmation.",
      reviewed_at: "2026-07-10T10:00:00Z",
      source_page: "manual",
    })).toMatchObject({ reviewLabel: "Reviewed", reviewTone: "gain" });
  });

  it("summarizes decision memory coverage without adding trade advice", () => {
    const summary = getDecisionMemorySummary([
      {
        entry_reason: "Scanner: Trend Template",
        status: "closed",
        lessons: "Waited for volume confirmation.",
        review_schema_version: 1,
        setup_adherence: "followed",
        review_lesson: "Waited for volume confirmation.",
        reviewed_at: "2026-07-10T10:00:00Z",
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
      { entry_reason: "Chart order", status: "closed", lessons: "Good stop discipline.", review_schema_version: 1, setup_adherence: "followed", review_lesson: "Good stop discipline.", reviewed_at: "2026-07-08T10:00:00Z", source_page: "chart", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Manual log", status: "closed", lessons: "Entry was late.", review_schema_version: 1, setup_adherence: "partial", review_lesson: "Entry was late.", reviewed_at: "2026-07-09T10:00:00Z", source_page: "manual", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Scanner: Stage 2", status: "closed", lessons: "Volume faded.", review_schema_version: 1, setup_adherence: "not_followed", review_lesson: "Volume faded.", reviewed_at: "2026-07-10T10:00:00Z", source_page: "scanner", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
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

  it("guides empty and under-sampled journals toward review unlock without trade advice", () => {
    expect(getJournalReviewStage([], {
      totalTrades: 0,
      closedTrades: 0,
      reviewedTrades: 0,
      needsReview: 0,
    })).toMatchObject({
      status: "empty",
      headline: "Start with one logged or imported trade",
      primaryAction: "Log first trade",
      secondaryAction: "Import broker trades",
      progressLabel: "0/3 closed trades",
    });

    const stage = getJournalReviewStage([
      { entry_reason: "Open plan", status: "open", lessons: null, source_page: "chart", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Closed trade", status: "closed", lessons: "Wait for confirmation.", source_page: "manual", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
    ], {
      totalTrades: 2,
      closedTrades: 1,
      reviewedTrades: 1,
      needsReview: 0,
    });

    expect(stage).toMatchObject({
      status: "build-sample",
      headline: "Build a 3-trade review base",
      progressLabel: "1/3 closed trades",
      progressPct: 33,
    });
    expect(`${stage.headline} ${stage.detail} ${stage.processChange}`).not.toMatch(/should|buy|sell|recommend/i);
  });

  it("surfaces review-ready action only after closed trades are reviewed", () => {
    const entries = [
      { entry_reason: "Chart order", status: "closed", lessons: "Protected the stop.", source_page: "chart", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Manual log", status: "closed", lessons: "Late entry.", source_page: "manual", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Scanner: Stage 2", status: "closed", lessons: "Volume faded.", source_page: "scanner", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
      { entry_reason: "Open plan", status: "open", lessons: null, source_page: "watchlist", source_context: null, scanner_context: null, thesis: null, invalidation_rule: null },
    ] satisfies Parameters<typeof getJournalReviewStage>[0];

    expect(getJournalReviewStage(entries, {
      totalTrades: 4,
      closedTrades: 3,
      reviewedTrades: 3,
      needsReview: 0,
    })).toMatchObject({
      status: "ready",
      primaryAction: "Run journal-wide review",
      secondaryAction: "Open Analytics",
      progressLabel: "3/3 reviewed",
      progressPct: 100,
    });

    expect(getJournalReviewStage(entries, {
      totalTrades: 4,
      closedTrades: 2,
      reviewedTrades: 2,
      needsReview: 0,
    })).toMatchObject({
      status: "build-sample",
      progressLabel: "2/3 closed trades",
    });
  });
});
