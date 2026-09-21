import { describe, expect, it } from "vitest";
import { defaultSetupReviewRules, evaluateSetupReview } from "@/lib/setup-review";

const completeSetup = {
  id: "setup-1",
  symbol: "TCS",
  direction: "long" as const,
  entry_low: 100,
  entry_high: 100,
  stop_price: 95,
  target_price: 110,
  planned_quantity: 10,
  planned_risk_amount: 50,
  thesis: "Breakout after a controlled pullback.",
  invalidation_reason: "Close below the base.",
};

describe("setup review", () => {
  it("passes a complete starter setup", () => {
    const review = evaluateSetupReview(completeSetup);

    expect(review.overall_status).toBe("passed");
    expect(review.can_proceed).toBe(true);
  });

  it("hard-blocks invalid geometry", () => {
    const review = evaluateSetupReview({ ...completeSetup, target_price: 98 });

    expect(review.overall_status).toBe("blocked");
    expect(review.can_proceed).toBe(false);
    expect(review.results.find((rule) => rule.code === "plan_geometry")?.status).toBe("fail");
  });

  it("requires an override for checklist warnings", () => {
    const withoutOverride = evaluateSetupReview({ ...completeSetup, invalidation_reason: "" });
    const withOverride = evaluateSetupReview(
      { ...completeSetup, invalidation_reason: "" },
      { override_reason: "Invalidation is monitored manually." },
    );

    expect(withoutOverride.overall_status).toBe("warned");
    expect(withoutOverride.can_proceed).toBe(false);
    expect(withOverride.can_proceed).toBe(true);
  });

  it("keeps the starter minimum reward-to-risk rule explicit", () => {
    const minimumRule = defaultSetupReviewRules().find((rule) => rule.code === "minimum_rr");

    expect(minimumRule?.config?.min_rr).toBe(2);
    expect(minimumRule?.severity).toBe("block");
  });
});
