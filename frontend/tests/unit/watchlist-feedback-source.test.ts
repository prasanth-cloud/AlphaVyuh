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

  it("exposes a row-level journal draft action without live execution copy", () => {
    expect(source).toContain("watchlist_order_draft_opened");
    expect(source).toContain("Draft order for");
    expect(source).toContain("Journal capture only: save the plan to Journal. Place any real trade directly with your broker.");
    expect(source).not.toContain("Place live order");
  });

  it("keeps chart review and journal capture as visible row-level actions", () => {
    expect(source).toContain("Open chart for");
    expect(source).toContain("Chart");
    expect(source).toContain("Draft");
    expect(source).toContain("onOpenChart(item.symbol)");
    expect(source).toContain("onDraftOrder(item.symbol)");
  });

  it("keeps the watchlist setup flow scanner, chart, decision, and journal first", () => {
    expect(source).toContain("watchlist-workflow-strip");
    expect(source).toContain("Queue workflow");
    expect(source).toContain("WATCHLIST_QUEUE_STEPS");
    expect(source).toContain("watchlist-workflow-step");
    expect(source).toContain("Add starter queue");
    expect(source).toContain('router.push("/scanner")');
  });

  it("prefetches chart candles from watchlist row intent", () => {
    expect(source).toContain("onPrefetchChart");
    expect(source).toContain("onMouseEnter={() => onPrefetchChart(item.symbol)}");
    expect(source).toContain("onFocus={() => onPrefetchChart(item.symbol)}");
    expect(source).toContain("prefetchWatchlistChart");
    expect(source).toContain('getWatchlistChartRequest("3M")');
    expect(source).toContain("prefetchCandles(symbol");
  });

  it("opens the journal capture ticket when a chart plan returns to the Decision Desk", () => {
    expect(source).toContain("Chart plan context loaded into Decision Desk. Journal ticket is ready.");
    expect(source).toContain("openOrderDraft(draftSymbol)");
  });
});
