import { describe, expect, it } from "vitest";
import { buildHigherTimeframeReview } from "@/lib/chart-review-timeframes";
import type { CandleBar } from "@/lib/api";

function candlesFrom(start: string, count: number, closeAt: (index: number) => number): CandleBar[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    const close = closeAt(index);
    return {
      time: date.toISOString().slice(0, 10),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000 + index,
    };
  });
}

describe("higher timeframe chart review", () => {
  it("marks weekly and monthly context aligned when both trends are constructive", () => {
    const review = buildHigherTimeframeReview(candlesFrom("2025-01-01", 420, (index) => 100 + index * 0.25));

    expect(review.alignment).toBe("aligned");
    expect(review.playbookStatus).toBe("ready");
    expect(review.playbookDetail).toBe("Weekly/monthly aligned");
    expect(review.weekly.summary).toContain("Weekly uptrend");
    expect(review.monthly.summary).toContain("Monthly uptrend");
  });

  it("keeps the playbook missing when loaded history cannot prove higher timeframe context", () => {
    const review = buildHigherTimeframeReview(candlesFrom("2026-01-01", 20, (index) => 100 + index));

    expect(review.alignment).toBe("limited");
    expect(review.playbookStatus).toBe("missing");
    expect(review.weekly.detail).toContain("need 14+");
    expect(review.monthly.detail).toContain("need 7+");
  });

  it("calls out mixed context when weekly improves but monthly remains weak", () => {
    const review = buildHigherTimeframeReview(candlesFrom("2025-01-01", 420, (index) => {
      if (index < 350) return 260 - index * 0.5;
      return 85 + (index - 350) * 0.22;
    }));

    expect(review.alignment).toBe("mixed");
    expect(review.playbookStatus).toBe("watch");
    expect(review.playbookDetail).toContain("/");
  });
});
