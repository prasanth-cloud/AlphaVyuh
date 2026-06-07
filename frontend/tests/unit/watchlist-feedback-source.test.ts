import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/watchlist/page.tsx", "utf8");

describe("watchlist feedback copy", () => {
  it("uses stable action-oriented copy for watchlist mutation failures", () => {
    expect(source).toContain("Check Watchlist or Data Status, then try again.");
    expect(source).toContain("Starter queue could not be completed.");
    expect(source).toContain("Watchlist order could not be saved.");
    expect(source).toContain("Watchlist note was saved locally.");
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Delete failed")');
    expect(source).not.toContain('showToast(e instanceof Error ? e.message : "Failed to create watchlist")');
    expect(source).not.toContain("failures.push(error instanceof Error ? error.message");
  });

  it("keeps duplicate adds specific without exposing backend errors", () => {
    expect(source).toContain("is already in this watchlist.");
    expect(source).toContain("already in watchlist");
  });

  it("labels unsaved decision records as watchlist sourced", () => {
    expect(source).toContain('source: "watchlist"');
    expect(source).toContain("decisionRecordRows({");
  });
});
