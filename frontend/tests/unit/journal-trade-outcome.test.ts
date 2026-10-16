import { describe, expect, it } from "vitest";
import { getTradeOutcomeCaption } from "@/app/(app)/journal/components/utils";

describe("journal trade outcomes", () => {
  it("shows a losing return independently of the planned ratio", () => {
    const entry = { status: "closed" as const, pnl_pct: -5, risk_reward: 3, stop_loss: 90 };

    expect(getTradeOutcomeCaption(entry)).toBe("-5.00%");
  });

  it("does not derive realized R from an editable stop when percent return is absent", () => {
    const entry = {
      status: "closed" as const, pnl_pct: null, risk_reward: 3,
      entry_price: 100, pnl: -50, quantity: 10, stop_loss: 90,
    };

    const adjustedStop = { ...entry, stop_loss: 99 };
    expect(getTradeOutcomeCaption(entry)).toBe("R unavailable");
    expect(getTradeOutcomeCaption(adjustedStop)).toBe("R unavailable");
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "keeps missing or non-finite percent return unavailable (%s)",
    (pnl_pct) => {
      expect(getTradeOutcomeCaption({ status: "closed", pnl_pct })).toBe("R unavailable");
    },
  );

  it.each([
    { pnl_pct: 0, caption: "+0.00%" },
    { pnl_pct: 5.25, caption: "+5.25%" },
    { pnl_pct: -1.5, caption: "-1.50%" },
  ])("formats a known closed-trade return ($pnl_pct)", ({ pnl_pct, caption }) => {
    expect(getTradeOutcomeCaption({ status: "closed", pnl_pct })).toBe(caption);
  });

  it("does not label an open or cancelled trade with a realized return", () => {
    expect(getTradeOutcomeCaption({ status: "open", pnl_pct: 5 })).toBe("Open trade");
    expect(getTradeOutcomeCaption({ status: "cancelled", pnl_pct: 5 })).toBe("Cancelled");
  });
});
