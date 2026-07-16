import type {
  JournalEntry,
  JournalRuleBreakCode,
  JournalWeeklyReviewResponse,
  JournalWeeklyReviewEvidenceResponse,
  JournalWeeklyReviewWeek,
  SaveJournalProcessReviewRequest,
  SetupAdherence,
  WeeklyReviewSupportingEntry,
} from "@/lib/api/types";

export const JOURNAL_RULE_BREAKS: ReadonlyArray<{ code: JournalRuleBreakCode; label: string }> = [
  { code: "setup_not_confirmed", label: "Setup criteria were not met" },
  { code: "entry_outside_plan", label: "Entry differed from plan" },
  { code: "position_risk_exceeded", label: "Position risk exceeded plan" },
  { code: "stop_rule_broken", label: "Stop rule was not followed" },
  { code: "exit_rule_broken", label: "Exit rule was not followed" },
  { code: "other", label: "Other recorded rule break" },
];

const RULE_CODES = new Set<JournalRuleBreakCode>(JOURNAL_RULE_BREAKS.map((item) => item.code));
const ADHERENCE = new Set<SetupAdherence>(["followed", "partial", "not_followed", "not_applicable"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID = /^[A-Za-z0-9-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}

function isoDate(value: unknown): string | null {
  const result = stringValue(value, 10);
  return result && ISO_DATE.test(result) ? result : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function validTimestamp(value: unknown): string | null {
  const result = stringValue(value, 64);
  return result && Number.isFinite(Date.parse(result)) ? result : null;
}

export function normalizeSetupAdherence(value: unknown): SetupAdherence | null {
  return typeof value === "string" && ADHERENCE.has(value as SetupAdherence) ? value as SetupAdherence : null;
}

export function normalizeRuleBreakCodes(value: unknown): JournalRuleBreakCode[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is JournalRuleBreakCode => (
    typeof item === "string" && RULE_CODES.has(item as JournalRuleBreakCode)
  )))).slice(0, JOURNAL_RULE_BREAKS.length);
}

export function isCompletedProcessReview(entry: Pick<JournalEntry, "review_schema_version" | "setup_adherence" | "reviewed_at" | "review_lesson">): boolean {
  return entry.review_schema_version === 1
    && normalizeSetupAdherence(entry.setup_adherence) !== null
    && Boolean(validTimestamp(entry.reviewed_at))
    && Boolean(stringValue(entry.review_lesson, 500));
}

export function validateProcessReviewDraft(request: SaveJournalProcessReviewRequest): string | null {
  if (!stringValue(request.planned_setup, 80)) return "Name the planned setup before saving the process review.";
  if (!stringValue(request.lesson, 500)) return "Add one lesson of 500 characters or fewer before saving the process review.";
  if (!validTimestamp(request.expected_updated_at)) return "This trade needs to be refreshed before review.";
  if (!normalizeSetupAdherence(request.adherence)) return "Select a valid setup-adherence state.";
  if (!Array.isArray(request.rule_breaks) || normalizeRuleBreakCodes(request.rule_breaks).length !== request.rule_breaks.length) {
    return "Select only supported rule-break categories.";
  }
  if (request.adherence === "partial" || request.adherence === "not_followed") {
    if (normalizeRuleBreakCodes(request.rule_breaks).length === 0) return "Select at least one concrete rule break.";
  } else if (request.rule_breaks.length > 0) {
    return "Rule breaks are only recorded for partial or not-followed reviews.";
  }
  return null;
}

export function normalizeProcessReviewedEntry(value: unknown): JournalEntry | null {
  const base = normalizeJournalEntryBase(value);
  if (!base || !isRecord(value)) return null;
  const reviewedAt = validTimestamp(value.reviewed_at);
  const adherence = normalizeSetupAdherence(value.setup_adherence);
  const plannedSetup = stringValue(value.planned_setup, 80);
  const lesson = stringValue(value.review_lesson, 500);
  if (!reviewedAt || value.review_schema_version !== 1 || !adherence || !plannedSetup || !lesson || !Array.isArray(value.rule_breaks)) return null;
  const ruleBreaks = normalizeRuleBreakCodes(value.rule_breaks);
  if (ruleBreaks.length !== value.rule_breaks.length) return null;
  if ((adherence === "partial" || adherence === "not_followed") && ruleBreaks.length === 0) return null;
  if ((adherence === "followed" || adherence === "not_applicable") && ruleBreaks.length > 0) return null;
  return {
    ...base,
    reviewed_at: reviewedAt,
    review_schema_version: 1,
    planned_setup: plannedSetup,
    setup_adherence: adherence,
    rule_breaks: ruleBreaks,
    review_lesson: lesson,
  };
}

function normalizeSupportingEntry(value: unknown): WeeklyReviewSupportingEntry | null {
  if (!isRecord(value)) return null;
  const entryId = stringValue(value.entry_id, 128);
  const symbol = stringValue(value.symbol, 32);
  const exitDate = isoDate(value.exit_date);
  const reviewStatus = value.review_status === "reviewed" || value.review_status === "unreviewed" ? value.review_status : null;
  if (!entryId || !SAFE_ID.test(entryId) || !symbol || !exitDate || !reviewStatus) return null;
  const adherence = normalizeSetupAdherence(value.setup_adherence);
  const plannedSetup = stringValue(value.planned_setup, 120);
  const lesson = stringValue(value.lesson, 500);
  const ruleBreaks = normalizeRuleBreakCodes(value.rule_breaks);
  if (reviewStatus === "reviewed") {
    if (!adherence || !plannedSetup || !lesson || !Array.isArray(value.rule_breaks) || ruleBreaks.length !== value.rule_breaks.length) return null;
    if ((adherence === "partial" || adherence === "not_followed") && ruleBreaks.length === 0) return null;
    if ((adherence === "followed" || adherence === "not_applicable") && ruleBreaks.length > 0) return null;
  }
  return {
    entry_id: entryId,
    symbol: symbol.toUpperCase(),
    exit_date: exitDate,
    planned_setup: reviewStatus === "reviewed" ? plannedSetup : null,
    review_status: reviewStatus,
    setup_adherence: reviewStatus === "reviewed" ? adherence : null,
    rule_breaks: reviewStatus === "reviewed" ? ruleBreaks : [],
    lesson: reviewStatus === "reviewed" ? lesson : null,
  };
}

function normalizeWeek(value: unknown): { week: JournalWeeklyReviewWeek; complete: boolean } | null {
  if (!isRecord(value) || !isRecord(value.adherence)) return null;
  const weekStart = isoDate(value.week_start);
  const weekEnd = isoDate(value.week_end);
  const closed = nonNegativeInteger(value.closed_trades);
  const reviewed = nonNegativeInteger(value.reviewed_trades);
  const unreviewed = nonNegativeInteger(value.unreviewed_trades);
  const denominator = nonNegativeInteger(value.adherence.denominator);
  const followed = nonNegativeInteger(value.adherence.followed);
  const partial = nonNegativeInteger(value.adherence.partial);
  const notFollowed = nonNegativeInteger(value.adherence.not_followed);
  const notApplicable = nonNegativeInteger(value.adherence.not_applicable);
  if (!weekStart || !weekEnd
    || closed == null || reviewed == null || unreviewed == null || denominator == null
    || followed == null || partial == null || notFollowed == null || notApplicable == null) return null;
  if (weekStart > weekEnd
    || closed !== reviewed + unreviewed
    || denominator !== followed + partial + notFollowed
    || reviewed !== denominator + notApplicable) return null;

  let complete = true;
  let supportingEntries = Array.isArray(value.supporting_entries)
    ? value.supporting_entries.map(normalizeSupportingEntry).filter((item): item is WeeklyReviewSupportingEntry => {
        if (!item) complete = false;
        return Boolean(item);
      })
    : [];
  if (!Array.isArray(value.supporting_entries)) complete = false;
  if (Array.isArray(value.supporting_entries) && value.supporting_entries.length > 500) complete = false;
  if (supportingEntries.some((entry) => entry.exit_date < weekStart || entry.exit_date > weekEnd)) {
    complete = false;
    supportingEntries = supportingEntries.filter((entry) => entry.exit_date >= weekStart && entry.exit_date <= weekEnd);
  }
  if (new Set(supportingEntries.map((entry) => entry.entry_id)).size !== supportingEntries.length) complete = false;
  if (supportingEntries.length !== closed
    || supportingEntries.filter((entry) => entry.review_status === "reviewed").length !== reviewed
    || supportingEntries.filter((entry) => entry.review_status === "unreviewed").length !== unreviewed) complete = false;
  const validIds = new Set(supportingEntries.map((entry) => entry.entry_id));
  if (Array.isArray(value.rule_breaks) && value.rule_breaks.length > JOURNAL_RULE_BREAKS.length) complete = false;
  const seenRuleCodes = new Set<JournalRuleBreakCode>();
  const ruleBreaks = Array.isArray(value.rule_breaks)
    ? value.rule_breaks.flatMap((row) => {
        if (!isRecord(row) || typeof row.code !== "string" || !RULE_CODES.has(row.code as JournalRuleBreakCode)) {
          complete = false;
          return [];
        }
        if (seenRuleCodes.has(row.code as JournalRuleBreakCode)) {
          complete = false;
          return [];
        }
        seenRuleCodes.add(row.code as JournalRuleBreakCode);
        const count = nonNegativeInteger(row.count);
        const ids = Array.isArray(row.entry_ids)
          ? Array.from(new Set(row.entry_ids.filter((id): id is string => typeof id === "string" && SAFE_ID.test(id) && validIds.has(id))))
          : [];
        if (count == null || count !== ids.length) {
          complete = false;
          return [];
        }
        return [{ code: row.code as JournalRuleBreakCode, count, entry_ids: ids }];
      })
    : [];
  if (!Array.isArray(value.rule_breaks)) complete = false;
  return {
    complete,
    week: {
      week_start: weekStart,
      week_end: weekEnd,
      closed_trades: closed,
      reviewed_trades: reviewed,
      unreviewed_trades: unreviewed,
      adherence: {
        followed,
        partial,
        not_followed: notFollowed,
        not_applicable: notApplicable,
        denominator,
      },
      rule_breaks: ruleBreaks,
      supporting_entries: supportingEntries,
    },
  };
}

export function normalizeJournalWeeklyReviewResponse(value: unknown): JournalWeeklyReviewResponse | null {
  if (!isRecord(value) || value.schema_version !== 1 || value.timezone !== "Asia/Kolkata" || value.week_basis !== "exit_date_monday_sunday" || value.completed_weeks_only !== true) return null;
  const generatedAt = validTimestamp(value.generated_at);
  const periodStart = isoDate(value.period_start);
  const periodEnd = isoDate(value.period_end);
  if (!generatedAt || !periodStart || !periodEnd || periodStart > periodEnd || !Array.isArray(value.weeks)) return null;
  let complete = value.coverage_complete === true;
  if (value.weeks.length > 12) complete = false;
  const weeks = value.weeks.flatMap((raw) => {
    const normalized = normalizeWeek(raw);
    if (!normalized) {
      complete = false;
      return [];
    }
    if (normalized.week.week_start < periodStart
      || normalized.week.week_end > periodEnd
      || normalized.week.week_end !== addDays(normalized.week.week_start, 6)
      || new Date(`${normalized.week.week_start}T00:00:00Z`).getUTCDay() !== 1) {
      complete = false;
      return [];
    }
    if (!normalized.complete) complete = false;
    return [normalized.week];
  });
  return {
    schema_version: 1,
    generated_at: generatedAt,
    timezone: "Asia/Kolkata",
    week_basis: "exit_date_monday_sunday",
    completed_weeks_only: true,
    period_start: periodStart,
    period_end: periodEnd,
    coverage_complete: complete,
    weeks,
  };
}

function nullableString(value: unknown, max = 500): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && value.length <= max ? value : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeJournalEntryBase(value: unknown): JournalEntry | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id, 128);
  const userId = stringValue(value.user_id, 128);
  const symbol = stringValue(value.symbol, 32);
  const companyName = nullableString(value.company_name, 160);
  const setupType = nullableString(value.setup_type, 120);
  const entryDate = isoDate(value.entry_date);
  const exitDate = value.exit_date === null ? null : isoDate(value.exit_date);
  const entryPrice = finiteNumber(value.entry_price);
  const quantity = finiteNumber(value.quantity);
  const exitPrice = nullableFiniteNumber(value.exit_price);
  const pnl = nullableFiniteNumber(value.pnl);
  const pnlPct = nullableFiniteNumber(value.pnl_pct);
  const holdingDays = nullableFiniteNumber(value.holding_days);
  const stopLoss = nullableFiniteNumber(value.stop_loss);
  const targetPrice = nullableFiniteNumber(value.target_price);
  const riskReward = nullableFiniteNumber(value.risk_reward);
  const entryReason = nullableString(value.entry_reason, 2_000);
  const exitReason = nullableString(value.exit_reason, 2_000);
  const mistakes = nullableString(value.mistakes, 2_000);
  const lessons = nullableString(value.lessons, 2_000);
  const createdAt = validTimestamp(value.created_at);
  const updatedAt = validTimestamp(value.updated_at);
  const tradeType = value.trade_type === "long" || value.trade_type === "short" ? value.trade_type : null;
  const status = value.status === "open" || value.status === "closed" || value.status === "cancelled" ? value.status : null;
  if (!id || !SAFE_ID.test(id) || !userId || !symbol || companyName === undefined || setupType === undefined
    || !entryDate || exitDate === undefined || entryPrice == null || quantity == null
    || [exitPrice, pnl, pnlPct, holdingDays, stopLoss, targetPrice, riskReward].some((item) => item === undefined)
    || [entryReason, exitReason, mistakes, lessons].some((item) => item === undefined)
    || !createdAt || !updatedAt || !tradeType || !status) return null;

  const sourcePage = value.source_page === "chart" || value.source_page === "watchlist" || value.source_page === "scanner" || value.source_page === "manual" || value.source_page === null
    ? value.source_page
    : null;
  return {
    id,
    user_id: userId,
    symbol: symbol.toUpperCase(),
    company_name: companyName,
    trade_type: tradeType,
    setup_type: setupType,
    entry_date: entryDate,
    entry_price: entryPrice,
    quantity,
    exit_date: exitDate,
    exit_price: exitPrice!,
    pnl: pnl!,
    pnl_pct: pnlPct!,
    holding_days: holdingDays!,
    stop_loss: stopLoss!,
    target_price: targetPrice!,
    risk_reward: riskReward!,
    entry_reason: entryReason!,
    exit_reason: exitReason!,
    mistakes: mistakes!,
    lessons: lessons!,
    status,
    source_page: sourcePage,
    source_context: nullableString(value.source_context, 500) ?? null,
    thesis: nullableString(value.thesis, 2_000) ?? null,
    invalidation_rule: nullableString(value.invalidation_rule, 2_000) ?? null,
    review_schema_version: null,
    planned_setup: null,
    setup_adherence: null,
    rule_breaks: null,
    review_lesson: null,
    reviewed_at: null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function normalizeJournalEvidenceEntry(value: unknown): JournalEntry | null {
  if (!isRecord(value)) return null;
  if (value.review_schema_version === 1) return normalizeProcessReviewedEntry(value);
  if (value.review_schema_version !== null) return null;
  return normalizeJournalEntryBase(value);
}

export function normalizeJournalWeeklyReviewEvidenceResponse(
  value: unknown,
  expected: { weekStart: string; entryIds: string[]; ruleBreak?: JournalRuleBreakCode },
): JournalWeeklyReviewEvidenceResponse | null {
  if (!isRecord(value) || value.coverage_complete !== true || !Array.isArray(value.entries) || !Array.isArray(value.requested_entry_ids)) return null;
  const weekStart = isoDate(value.week_start);
  const weekEnd = isoDate(value.week_end);
  const ruleBreak = value.rule_break === null ? null : (typeof value.rule_break === "string" && RULE_CODES.has(value.rule_break as JournalRuleBreakCode) ? value.rule_break as JournalRuleBreakCode : undefined);
  const matchedCount = nonNegativeInteger(value.matched_count);
  if (!weekStart || weekStart !== expected.weekStart || new Date(`${weekStart}T00:00:00Z`).getUTCDay() !== 1
    || !weekEnd || weekEnd !== addDays(weekStart, 6) || ruleBreak === undefined
    || ruleBreak !== (expected.ruleBreak ?? null) || matchedCount == null || expected.entryIds.length < 1 || expected.entryIds.length > 500) return null;
  const requested = value.requested_entry_ids.filter((id): id is string => typeof id === "string" && SAFE_ID.test(id));
  const expectedIds = Array.from(new Set(expected.entryIds));
  if (requested.length !== value.requested_entry_ids.length || requested.length !== expectedIds.length
    || new Set(requested).size !== requested.length || requested.some((id) => !expectedIds.includes(id))) return null;
  const entries = value.entries.map(normalizeJournalEvidenceEntry);
  if (entries.some((entry) => !entry)) return null;
  const validEntries = entries.filter((entry): entry is JournalEntry => Boolean(entry));
  const ids = validEntries.map((entry) => entry.id);
  if (matchedCount !== expectedIds.length || ids.length !== expectedIds.length || new Set(ids).size !== ids.length
    || ids.some((id) => !expectedIds.includes(id)) || new Set(validEntries.map((entry) => entry.user_id)).size !== 1
    || validEntries.some((entry) => entry.status !== "closed" || entry.exit_date == null || entry.exit_date < weekStart || entry.exit_date > weekEnd)) return null;
  if (ruleBreak && validEntries.some((entry) => !normalizeRuleBreakCodes(entry.rule_breaks).includes(ruleBreak))) return null;
  return { coverage_complete: true, week_start: weekStart, week_end: weekEnd, rule_break: ruleBreak, requested_entry_ids: requested, matched_count: matchedCount, entries: validEntries };
}

function dateInKolkata(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function mondayOf(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const offset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - offset);
  return parsed.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function buildMockJournalWeeklyReviews(entries: JournalEntry[], weeksLimit = 8, now = new Date()): JournalWeeklyReviewResponse {
  const currentWeekStart = mondayOf(dateInKolkata(now));
  const groups = new Map<string, JournalEntry[]>();
  entries.forEach((entry) => {
    if (entry.status !== "closed" || !entry.exit_date || !ISO_DATE.test(entry.exit_date.slice(0, 10))) return;
    const exitDate = entry.exit_date.slice(0, 10);
    const weekStart = mondayOf(exitDate);
    if (weekStart >= currentWeekStart) return;
    groups.set(weekStart, [...(groups.get(weekStart) ?? []), entry]);
  });
  const weeks = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, weeksLimit).map(([weekStart, rows]) => {
    const reviewedRows = rows.filter(isCompletedProcessReview);
    const adherence = {
      followed: reviewedRows.filter((row) => row.setup_adherence === "followed").length,
      partial: reviewedRows.filter((row) => row.setup_adherence === "partial").length,
      not_followed: reviewedRows.filter((row) => row.setup_adherence === "not_followed").length,
      not_applicable: reviewedRows.filter((row) => row.setup_adherence === "not_applicable").length,
      denominator: reviewedRows.filter((row) => row.setup_adherence !== "not_applicable").length,
    };
    const supportingEntries: WeeklyReviewSupportingEntry[] = rows.map((row) => ({
      entry_id: row.id,
      symbol: row.symbol,
      exit_date: row.exit_date!.slice(0, 10),
      planned_setup: row.planned_setup ?? null,
      review_status: isCompletedProcessReview(row) ? "reviewed" : "unreviewed",
      setup_adherence: isCompletedProcessReview(row) ? normalizeSetupAdherence(row.setup_adherence) : null,
      rule_breaks: isCompletedProcessReview(row) ? normalizeRuleBreakCodes(row.rule_breaks) : [],
      lesson: isCompletedProcessReview(row) ? stringValue(row.review_lesson, 500) : null,
    }));
    const ruleBreaks = JOURNAL_RULE_BREAKS.flatMap(({ code }) => {
      const ids = supportingEntries.filter((entry) => entry.rule_breaks.includes(code)).map((entry) => entry.entry_id);
      return ids.length ? [{ code, count: ids.length, entry_ids: ids }] : [];
    });
    return {
      week_start: weekStart,
      week_end: addDays(weekStart, 6),
      closed_trades: rows.length,
      reviewed_trades: reviewedRows.length,
      unreviewed_trades: rows.length - reviewedRows.length,
      adherence,
      rule_breaks: ruleBreaks,
      supporting_entries: supportingEntries,
    };
  });
  const periodStart = weeks.at(-1)?.week_start ?? addDays(currentWeekStart, -(weeksLimit * 7));
  const periodEnd = weeks[0]?.week_end ?? addDays(currentWeekStart, -1);
  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    timezone: "Asia/Kolkata",
    week_basis: "exit_date_monday_sunday",
    completed_weeks_only: true,
    period_start: periodStart,
    period_end: periodEnd,
    coverage_complete: true,
    weeks,
  };
}

export function journalRuleBreakLabel(code: JournalRuleBreakCode): string {
  return JOURNAL_RULE_BREAKS.find((item) => item.code === code)?.label ?? "Recorded rule break";
}
