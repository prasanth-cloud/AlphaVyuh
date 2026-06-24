import { describe, expect, it } from "vitest";
import {
  displayCompanyName,
} from "@/lib/company-display";
import { decisionJournalHref } from "@/lib/decision-record";
import {
  getItemSignals,
  resolveWatchlistQueueStep,
  WATCHLIST_QUEUE_STEPS,
} from "@/lib/watchlist-ux";

describe("watchlist UX helpers", () => {
  it("hides duplicate company names in queue display", () => {
    expect(displayCompanyName("SANSERA", "SANSERA")).toBe("");
    expect(displayCompanyName("NOCIL", "NOCIL Limited")).toBe("NOCIL Limited");
  });

  it("labels queue workflow steps Screen/Chart/Decision/Journal", () => {
    expect(WATCHLIST_QUEUE_STEPS.map((step) => step.label)).toEqual([
      "Screen",
      "Chart",
      "Decision",
      "Journal",
    ]);
  });

  it("resolves active workflow step from chart and decision desk state", () => {
    expect(resolveWatchlistQueueStep({ chartSymbol: null, decisionExpanded: false, plan: null })).toBe("screen");
    expect(resolveWatchlistQueueStep({ chartSymbol: "RELIANCE", decisionExpanded: false, plan: null })).toBe("chart");
    expect(
      resolveWatchlistQueueStep({
        chartSymbol: "RELIANCE",
        decisionExpanded: true,
        plan: { symbol: "RELIANCE", entry: 100 } as never,
      }),
    ).toBe("decision");
  });

  it("builds journal draft links for unlinked decisions", () => {
    expect(decisionJournalHref({ symbol: "TCS" })).toBe("/journal?tab=queue&symbol=TCS");
    expect(decisionJournalHref({ symbol: "TCS", journal_id: "abc" })).toBeNull();
  });

  it("limits signal badges to green/amber tones", () => {
    const signals = getItemSignals({
      symbol: "TEST",
      sort_order: 0,
      added_at: "2026-01-01T00:00:00Z",
      pct_change: 2.5,
      volume_ratio: 1.6,
      rsi_14: 60,
    });
    expect(signals.every((signal) => signal.tone === "gain" || signal.tone === "amber")).toBe(true);
    expect(signals.length).toBeGreaterThan(0);
  });
});
