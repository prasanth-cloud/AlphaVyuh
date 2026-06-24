import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/journal/page.tsx", "utf8");
const tradeTableSource = readFileSync("app/(app)/journal/components/TradeTable.tsx", "utf8");
const globalStyles = readFileSync("app/globals.css", "utf8");

describe("journal feedback copy", () => {
  it("uses stable action-oriented copy for journal mutations", () => {
    expect(source).toContain("Check Journal or Data Status, then try again.");
    expect(source).toContain("Trade could not be saved.");
    expect(source).toContain("Trade could not be closed.");
    expect(source).toContain("Trade lesson could not be generated.");
    expect(source).toContain("Review could not be saved.");
    expect(source).toContain("Broker import could not run. Check Broker or Data Status, then try again.");
    expect(source).toContain("Journal analysis could not run.");
  });

  it("does not expose raw backend messages in journal action toasts", () => {
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Failed to save")');
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Failed to close")');
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Trade lesson failed")');
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Review save failed")');
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Import failed")');
    expect(source).not.toContain('setAiError(e instanceof Error ? e.message : "Analysis failed")');
  });

  it("keeps Journal review-first before the trade ledger", () => {
    expect(source).toContain('useState<Tab>("queue")');
    expect(source).toContain('{ id: "queue", label: "Review queue" }');
    expect(source).toContain('{ id: "ai", label: "Trade review" }');
    expect(source.indexOf('data-testid="journal-review-queue"')).toBeLessThan(source.indexOf('<TradeTable'));
    expect(source).toContain('getJournalReviewStage(entries');
    expect(source).toContain("Open Analytics");
    expect(source).not.toContain("{reviewStage.primaryAction}");
  });

  it("keeps mobile journal rows actionable without horizontal table hunting", () => {
    expect(tradeTableSource).toContain("journal-mobile-trade-card");
    expect(tradeTableSource).toContain("journal-mobile-trade-grid");
    expect(tradeTableSource).toContain("P&L / R");
    expect(tradeTableSource).toContain("Source");
    expect(tradeTableSource).toContain("Review");
    expect(globalStyles).toContain(".journal-table-mobile-hide");
    expect(globalStyles).toContain(".journal-table-secondary");
    expect(globalStyles).toContain(".journal-table {\n    min-width: 0;");
  });
});
