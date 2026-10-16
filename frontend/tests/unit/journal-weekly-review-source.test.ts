import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/(app)/journal/page.tsx", "utf8");
const panel = readFileSync("app/(app)/journal/components/TradePanel.tsx", "utf8");
const weekly = readFileSync("app/(app)/journal/components/JournalWeeklyReview.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

describe("weekly process review placement and trust copy", () => {
  it("keeps weekly review inside Journal and lazy loads it", () => {
    expect(page).toContain('{ id: "weekly", label: "Weekly review" }');
    expect(page).toContain('tab === "weekly"');
    expect(page).toContain("getJournalWeeklyReviews(8)");
    expect(page).toContain("getJournalWeeklyReviewEvidence");
    expect(page).toContain("No local trade rows were substituted");
    expect(page).toContain("invalidateWeeklyReview()");
  });

  it("requires explicit adherence and keeps legacy lessons unreviewed", () => {
    expect(panel).toContain("Adherence not reviewed");
    expect(panel).toContain("Save process review");
    expect(panel).toContain("Self-reported adherence evidence");
    expect(panel).toContain("selectedEntry?.review_lesson ?? selectedEntry?.lessons");
  });

  it("shows sample counts and excludes advice, scores, and P&L claims", () => {
    expect(weekly).toContain("reviewed of");
    expect(weekly).toContain("Asia/Kolkata");
    expect(weekly).toContain("The current incomplete week is excluded");
    expect(weekly).toContain("Evidence exceeds 500 trades");
    expect(weekly).toContain("no partial ledger will be shown");
    expect(weekly).toContain("rule.entry_ids.length > 500");
    expect(weekly).not.toMatch(/adherence score|recommend|buy|sell|profit|p&l/i);
  });

  it("uses one-column weekly cards on small screens", () => {
    expect(styles).toContain(".journal-weekly-grid");
    expect(styles).toContain("grid-template-columns: 1fr !important");
  });
});
