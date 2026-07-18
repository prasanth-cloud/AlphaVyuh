import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("journal chart snapshot trust copy", () => {
  it("keeps the primary journal action successful when snapshot attachment fails", () => {
    const source = fs.readFileSync(path.join(root, "components/charts/OrderModal.tsx"), "utf8");
    const orderIndex = source.indexOf("await placeOrder(req)");
    const attachmentIndex = source.indexOf("await attachJournalChartSnapshot");

    expect(orderIndex).toBeGreaterThan(-1);
    expect(attachmentIndex).toBeGreaterThan(orderIndex);
    expect(source).toContain("primary journal action was not reversed");
    expect(source).toContain("An image preview is not available in this release");
  });

  it("distinguishes immutable structured state from the mutable current chart", () => {
    const panelSource = fs.readFileSync(path.join(root, "app/(app)/journal/components/TradePanel.tsx"), "utf8");
    const timelineSource = fs.readFileSync(path.join(root, "app/(app)/journal/components/JournalReviewTimeline.tsx"), "utf8");

    expect(timelineSource).toContain("Immutable chart context");
    expect(timelineSource).toContain("this is structured chart state, not a screenshot");
    expect(panelSource).toContain("Open current chart");
    expect(`${panelSource}\n${timelineSource}`).not.toContain("Open chart at entry");
  });

  it("renders one shared decision timeline for both view and close modes", () => {
    const panelSource = fs.readFileSync(path.join(root, "app/(app)/journal/components/TradePanel.tsx"), "utf8");
    const timelineSource = fs.readFileSync(path.join(root, "app/(app)/journal/components/JournalReviewTimeline.tsx"), "utf8");
    const sharedTimeline = panelSource.indexOf('selectedEntry && mode !== "add"');
    const closeBranch = panelSource.indexOf('mode === "close" && selectedEntry');
    const viewBranch = panelSource.indexOf('mode === "view" && selectedEntry');

    expect(sharedTimeline).toBeGreaterThan(-1);
    expect(sharedTimeline).toBeLessThan(closeBranch);
    expect(sharedTimeline).toBeLessThan(viewBranch);
    expect(panelSource.match(/<JournalReviewTimeline/g)).toHaveLength(1);
    expect(timelineSource.match(/"journal-immutable-chart-context"/g)).toHaveLength(1);
  });
});
