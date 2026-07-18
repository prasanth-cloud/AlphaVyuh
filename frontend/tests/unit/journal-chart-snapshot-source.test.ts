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
    const source = fs.readFileSync(path.join(root, "app/(app)/journal/components/TradePanel.tsx"), "utf8");

    expect(source).toContain("Immutable chart context");
    expect(source).toContain("This is structured chart state, not a screenshot");
    expect(source).toContain("Open current chart");
    expect(source).not.toContain("Open chart at entry");
  });

  it("renders one shared immutable-context block for both view and close modes", () => {
    const source = fs.readFileSync(path.join(root, "app/(app)/journal/components/TradePanel.tsx"), "utf8");
    const sharedBlock = source.indexOf('selectedEntry && mode !== "add" && selectedEntry.snapshot_state_path');
    const closeBranch = source.indexOf('mode === "close" && selectedEntry');
    const viewBranch = source.indexOf('mode === "view" && selectedEntry');

    expect(sharedBlock).toBeGreaterThan(-1);
    expect(sharedBlock).toBeLessThan(closeBranch);
    expect(sharedBlock).toBeLessThan(viewBranch);
    expect(source.match(/data-testid="journal-immutable-chart-context"/g)).toHaveLength(1);
  });
});
