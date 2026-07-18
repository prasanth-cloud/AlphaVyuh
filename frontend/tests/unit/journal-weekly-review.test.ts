import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildMockJournalWeeklyReviews,
  isCompletedProcessReview,
  normalizeJournalWeeklyReviewResponse,
  normalizeJournalWeeklyReviewEvidenceResponse,
  normalizeProcessReviewedEntry,
  normalizeSetupAdherence,
  validateProcessReviewDraft,
} from "@/lib/journal-weekly-review";
import type { JournalEntry } from "@/lib/api";

function entry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: "trade-1",
    user_id: "user-1",
    symbol: "TCS",
    company_name: null,
    trade_type: "long",
    setup_type: "breakout",
    entry_date: "2026-07-01",
    entry_price: 100,
    quantity: 1,
    exit_date: "2026-07-10",
    exit_price: 110,
    pnl: 10,
    pnl_pct: 10,
    holding_days: 9,
    stop_loss: 95,
    target_price: 110,
    risk_reward: 2,
    entry_reason: null,
    exit_reason: null,
    mistakes: null,
    lessons: null,
    status: "closed",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-10T10:00:00Z",
    ...overrides,
  };
}

describe("journal process review", () => {
  it("keeps legacy lesson-only entries explicitly unreviewed", () => {
    expect(isCompletedProcessReview(entry({ lessons: "AI-generated legacy lesson" }))).toBe(false);
    expect(isCompletedProcessReview(entry({
      review_schema_version: 1,
      planned_setup: "Breakout",
      setup_adherence: "followed",
      rule_breaks: [],
      review_lesson: "Wait for the trigger.",
      reviewed_at: "2026-07-11T10:00:00Z",
    }))).toBe(true);
  });

  it("validates atomic review combinations", () => {
    const base = {
      schema_version: 1 as const,
      planned_setup: "Breakout",
      adherence: "partial" as const,
      rule_breaks: [],
      lesson: "Wait for confirmation.",
      expected_updated_at: "2026-07-10T10:00:00Z",
    };
    expect(validateProcessReviewDraft(base)).toMatch(/rule break/i);
    expect(validateProcessReviewDraft({ ...base, rule_breaks: ["entry_outside_plan"] })).toBeNull();
    expect(normalizeSetupAdherence("future_state")).toBeNull();
  });

  it("strictly parses the full process-review journal row", () => {
    const reviewed = entry({
      review_schema_version: 1,
      planned_setup: "Breakout",
      setup_adherence: "followed",
      rule_breaks: [],
      review_lesson: "Wait for confirmation.",
      reviewed_at: "2026-07-11T10:00:00Z",
    });
    expect(normalizeProcessReviewedEntry(reviewed)?.quantity).toBe(1);
    expect(normalizeProcessReviewedEntry({ ...reviewed, quantity: "1" })).toBeNull();
    expect(normalizeProcessReviewedEntry({ ...reviewed, entry_price: null })).toBeNull();
    expect(normalizeProcessReviewedEntry({ ...reviewed, status: "future_status" })).toBeNull();
    expect(normalizeProcessReviewedEntry({ ...reviewed, entry_date: "not-a-date" })).toBeNull();
    expect(normalizeProcessReviewedEntry({ ...reviewed, lessons: { unsafe: true } })).toBeNull();
  });
});

describe("weekly review normalizer", () => {
  const response = {
    schema_version: 1,
    generated_at: "2026-07-16T12:00:00Z",
    timezone: "Asia/Kolkata",
    week_basis: "exit_date_monday_sunday",
    completed_weeks_only: true,
    period_start: "2026-07-06",
    period_end: "2026-07-12",
    coverage_complete: true,
    weeks: [{
      week_start: "2026-07-06",
      week_end: "2026-07-12",
      closed_trades: 2,
      reviewed_trades: 1,
      unreviewed_trades: 1,
      adherence: { followed: 0, partial: 1, not_followed: 0, not_applicable: 0, denominator: 1 },
      rule_breaks: [{ code: "entry_outside_plan", count: 1, entry_ids: ["trade-1"] }],
      supporting_entries: [
        { entry_id: "trade-1", symbol: "TCS", exit_date: "2026-07-10", planned_setup: "Breakout", review_status: "reviewed", setup_adherence: "partial", rule_breaks: ["entry_outside_plan"], lesson: "Wait." },
        { entry_id: "trade-2", symbol: "INFY", exit_date: "2026-07-11", planned_setup: null, review_status: "unreviewed", setup_adherence: null, rule_breaks: [], lesson: null },
      ],
    }],
  };

  it("preserves numerator, denominator, timezone, and exact validated evidence IDs", () => {
    const parsed = normalizeJournalWeeklyReviewResponse(response);
    expect(parsed?.timezone).toBe("Asia/Kolkata");
    expect(parsed?.weeks[0]?.adherence).toMatchObject({ partial: 1, denominator: 1 });
    expect(parsed?.weeks[0]?.rule_breaks[0]?.entry_ids).toEqual(["trade-1"]);
  });

  it("keeps not-applicable reviews outside the adherence denominator", () => {
    const notApplicable = {
      ...response,
      weeks: [{
        ...response.weeks[0],
        closed_trades: 1,
        reviewed_trades: 1,
        unreviewed_trades: 0,
        adherence: { followed: 0, partial: 0, not_followed: 0, not_applicable: 1, denominator: 0 },
        rule_breaks: [],
        supporting_entries: [{
          entry_id: "trade-na",
          symbol: "TCS",
          exit_date: "2026-07-10",
          planned_setup: "No planned setup",
          review_status: "reviewed",
          setup_adherence: "not_applicable",
          rule_breaks: [],
          lesson: "Record the plan before entry next time.",
        }],
      }],
    };
    expect(normalizeJournalWeeklyReviewResponse(notApplicable)?.weeks[0]?.adherence).toMatchObject({
      denominator: 0,
      not_applicable: 1,
    });
  });

  it("shares the backend adherence denominator contract", () => {
    const contract = JSON.parse(readFileSync("../tests/fixtures/journal-weekly-review-contract-v1.json", "utf8"));
    expect(contract.schema_version).toBe(1);
    expect(contract.reviewed_trades).toBe(
      contract.adherence.denominator + contract.adherence.not_applicable,
    );
    expect(contract.adherence.denominator).toBe(
      contract.adherence.followed + contract.adherence.partial + contract.adherence.not_followed,
    );
  });

  it("fails closed for malformed count invariants", () => {
    const parsed = normalizeJournalWeeklyReviewResponse({
      ...response,
      weeks: [{ ...response.weeks[0], reviewed_trades: 2 }],
    });
    expect(parsed?.coverage_complete).toBe(false);
    expect(parsed?.weeks).toEqual([]);
  });

  it("omits malformed reviewed evidence and marks coverage partial", () => {
    const parsed = normalizeJournalWeeklyReviewResponse({
      ...response,
      weeks: [{
        ...response.weeks[0],
        supporting_entries: [
          { ...response.weeks[0].supporting_entries[0], setup_adherence: "future_state" },
          response.weeks[0].supporting_entries[1],
        ],
      }],
    });
    expect(parsed?.coverage_complete).toBe(false);
    expect(parsed?.weeks[0]?.supporting_entries.map((item) => item.entry_id)).toEqual(["trade-2"]);
    expect(parsed?.weeks[0]?.rule_breaks).toEqual([]);
  });

  it("uses server period_end instead of the device clock for completed-week validation", () => {
    const futureServerPeriod = {
      ...response,
      period_start: "2030-01-07",
      period_end: "2030-01-13",
      weeks: [{ ...response.weeks[0], week_start: "2030-01-07", week_end: "2030-01-13" }],
    };
    expect(normalizeJournalWeeklyReviewResponse(futureServerPeriod)?.weeks).toHaveLength(1);
    expect(normalizeJournalWeeklyReviewResponse({ ...response, period_end: "2026-07-11" })?.weeks).toEqual([]);
  });

  it("does not silently truncate oversized supporting evidence", () => {
    const supportingEntries = Array.from({ length: 501 }, (_, index) => ({
      entry_id: `trade-${index}`,
      symbol: "TCS",
      exit_date: "2026-07-10",
      planned_setup: null,
      review_status: "unreviewed",
      setup_adherence: null,
      rule_breaks: [],
      lesson: null,
    }));
    const parsed = normalizeJournalWeeklyReviewResponse({
      ...response,
      weeks: [{
        ...response.weeks[0],
        closed_trades: 501,
        reviewed_trades: 0,
        unreviewed_trades: 501,
        adherence: { followed: 0, partial: 0, not_followed: 0, not_applicable: 0, denominator: 0 },
        rule_breaks: [],
        supporting_entries: supportingEntries,
      }],
    });
    expect(parsed?.coverage_complete).toBe(false);
    expect(parsed?.weeks[0]?.supporting_entries).toHaveLength(501);
  });
});

describe("weekly review evidence normalizer", () => {
  const evidenceEntry = entry({
    id: "trade-evidence",
    review_schema_version: null,
    exit_date: "2026-07-10",
  });

  it("requires complete, exact, unique server evidence", () => {
    const envelope = {
      coverage_complete: true,
      week_start: "2026-07-06",
      week_end: "2026-07-12",
      rule_break: null,
      requested_entry_ids: ["trade-evidence"],
      matched_count: 1,
      entries: [evidenceEntry],
    };
    expect(normalizeJournalWeeklyReviewEvidenceResponse(envelope, {
      weekStart: "2026-07-06",
      entryIds: ["trade-evidence"],
    })?.entries[0]?.id).toBe("trade-evidence");
    expect(normalizeJournalWeeklyReviewEvidenceResponse({ ...envelope, coverage_complete: false }, {
      weekStart: "2026-07-06",
      entryIds: ["trade-evidence"],
    })).toBeNull();
    expect(normalizeJournalWeeklyReviewEvidenceResponse({ ...envelope, matched_count: 0, entries: [] }, {
      weekStart: "2026-07-06",
      entryIds: ["trade-evidence"],
    })).toBeNull();
  });
});

describe("mock weekly aggregation", () => {
  it("excludes the current incomplete week and counts only explicit reviews", () => {
    const reviewed = entry({
      id: "trade-reviewed",
      review_schema_version: 1,
      planned_setup: "Breakout",
      setup_adherence: "followed",
      rule_breaks: [],
      review_lesson: "Wait.",
      reviewed_at: "2026-07-11T10:00:00Z",
    });
    const legacy = entry({ id: "trade-legacy", exit_date: "2026-07-11", lessons: "Old lesson" });
    const current = entry({ id: "trade-current", exit_date: "2026-07-15" });
    const result = buildMockJournalWeeklyReviews([reviewed, legacy, current], 8, new Date("2026-07-16T12:00:00Z"));

    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0]).toMatchObject({ closed_trades: 2, reviewed_trades: 1, unreviewed_trades: 1 });
    expect(result.weeks[0]?.supporting_entries.map((item) => item.entry_id)).not.toContain("trade-current");
  });
});
