import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journalPageSource = readFileSync("app/(app)/journal/page.tsx", "utf8");
const aiInsightsSource = readFileSync("app/(app)/journal/components/JournalAiInsights.tsx", "utf8");
const analyticsSource = readFileSync("app/(app)/journal/components/JournalAnalytics.tsx", "utf8");

describe("journal UX copy and placement", () => {
  it("uses clearer decision memory copy", () => {
    expect(journalPageSource).toContain("have full context attached (source, chart, or broker link)");
    expect(journalPageSource).not.toContain("closed trades include scanner, chart, watchlist, or broker context");
  });

  it("moves journal-wide review CTA to trade review tab", () => {
    expect(aiInsightsSource).toContain('data-testid="journal-wide-review-cta"');
    expect(aiInsightsSource).toContain("Run journal-wide review");
    expect(journalPageSource).toContain("Open Analytics");
    expect(journalPageSource).not.toContain("{reviewStage.primaryAction}");
  });

  it("supports process note expand and calendar heatmap", () => {
    expect(journalPageSource).toContain("Read more →");
    expect(journalPageSource).toContain("onCalendarDateSelect");
    expect(analyticsSource).toContain("JournalCalendarHeatmap");
  });
});
