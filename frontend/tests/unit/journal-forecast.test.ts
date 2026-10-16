import { describe, expect, it } from "vitest";
import { calculateCompoundedScenario, calculateJournalForecast, type ForecastInputs } from "@/lib/journal-forecast";

const inputs: ForecastInputs = {
  portfolioSize: 200_000,
  positionSizePct: 25,
  desiredReturnPct: 40,
  averageGainPct: 14,
  averageLossPct: 7,
  winRatePct: 46,
};

describe("journal scenario forecast", () => {
  it("calculates the supplied example with exact arithmetic and rounds required trades up", () => {
    const result = calculateJournalForecast(inputs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.positionValue).toBe(50_000);
    expect(result.averageWinCash).toBeCloseTo(7_000);
    expect(result.averageLossCash).toBeCloseTo(3_500);
    expect(result.payoffRatio).toBe(2);
    expect(result.adjustedPayoffRatio).toBeCloseTo(1.7037037037);
    expect(result.expectedTradeReturnPct).toBeCloseTo(2.66);
    expect(result.expectedPortfolioReturnPct).toBeCloseTo(0.665);
    expect(result.expectedTradeReturnCash).toBeCloseTo(1_330);
    expect(result.goalCash).toBe(80_000);
    expect(result.tradesNeeded).toBe(61);
    expect(result.expectedWinningTrades).toBeCloseTo(28.06);
    expect(result.expectedLosingTrades).toBeCloseTo(32.94);
    expect(result.kellyRiskFractionPct).toBeCloseTo(19);
  });

  it("keeps a nonpositive-expectancy goal unreachable rather than making negative trade counts", () => {
    const result = calculateJournalForecast({ ...inputs, averageGainPct: 5, averageLossPct: 6, winRatePct: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.expectedTradeReturnCash).toBeLessThan(0);
    expect(result.tradesNeeded).toBeNull();
    expect(result.expectedWinningTrades).toBeNull();
    expect(result.expectedLosingTrades).toBeNull();
    expect(result.kellyRiskFractionPct).toBeLessThan(0);
  });

  it("requires zero trades for a zero target", () => {
    const result = calculateJournalForecast({ ...inputs, desiredReturnPct: 0 });
    expect(result.ok && result.tradesNeeded).toBe(0);
  });

  it("keeps the loss-weighted ratio unknown for an all-win assumption", () => {
    const result = calculateJournalForecast({ ...inputs, winRatePct: 100 });
    expect(result.ok && result.adjustedPayoffRatio).toBeNull();
  });

  it("recognizes mathematically break-even decimal assumptions", () => {
    const result = calculateJournalForecast({ ...inputs, averageGainPct: 7, averageLossPct: 3, winRatePct: 30 });
    if (!result.ok) throw new Error(result.error);
    expect(result.expectedTradeReturnPct).toBe(0);
    expect(result.tradesNeeded).toBeNull();
  });

  it("does not add a trade because of floating-point error at an exact goal boundary", () => {
    const result = calculateJournalForecast({ portfolioSize: 100_000, positionSizePct: 1, desiredReturnPct: 1,
      averageGainPct: 19, averageLossPct: 1, winRatePct: 6 });
    if (!result.ok) throw new Error(result.error);
    expect(result.expectedTradeReturnCash).toBeCloseTo(2);
    expect(result.tradesNeeded).toBe(500);
  });

  it("does not round a genuine fractional requirement down at large counts", () => {
    const result = calculateJournalForecast({ portfolioSize: 100, positionSizePct: 1,
      desiredReturnPct: 1000.0000000000003, averageGainPct: 1e-10, averageLossPct: 1, winRatePct: 100 });
    if (!result.ok) throw new Error(result.error);
    expect(result.tradesNeeded).toBe(1_000_000_000_000_001);
  });

  it("keeps loss magnitudes above 100 percent valid for short-trade scenarios", () => {
    expect(calculateJournalForecast({ ...inputs, averageLossPct: 150 }).ok).toBe(true);
  });

  it.each([
    { portfolioSize: 0 }, { portfolioSize: -1 }, { portfolioSize: Number.NaN },
    { positionSizePct: 0 }, { positionSizePct: 101 },
    { desiredReturnPct: -1 }, { averageGainPct: 0 }, { averageLossPct: 0 },
    { winRatePct: -1 }, { winRatePct: 101 }, { winRatePct: Number.POSITIVE_INFINITY },
    { portfolioSize: Number.MAX_VALUE, averageGainPct: Number.MAX_VALUE },
    { portfolioSize: Number.MIN_VALUE, positionSizePct: 1 },
    { portfolioSize: 100, positionSizePct: 1, averageGainPct: 1e308, averageLossPct: 1, winRatePct: 100 },
  ])("rejects invalid or numerically unrepresentable assumptions (%j)", (change) => {
    expect(calculateJournalForecast({ ...inputs, ...change }).ok).toBe(false);
  });

  it("doubling position allocation halves the unrounded capital requirement", () => {
    const base = calculateJournalForecast(inputs);
    const larger = calculateJournalForecast({ ...inputs, positionSizePct: 50 });
    if (!base.ok || !larger.ok) throw new Error("Valid fixtures rejected");
    expect(larger.expectedTradeReturnCash).toBeCloseTo(base.expectedTradeReturnCash * 2);
    expect(larger.tradesNeeded).toBe(31);
    expect(larger.kellyRiskFractionPct).toBe(base.kellyRiskFractionPct);
  });
});

describe("separate reinvestment scenario", () => {
  it("compounds reused capital rather than adding returns", () => {
    const result = calculateCompoundedScenario(10, 6);
    expect(result.ok && result.compoundedReturnPct).toBeCloseTo(77.1561);
    expect(calculateCompoundedScenario(40, 1)).toEqual({ ok: true, compoundedReturnPct: 40 });
  });
  it("supports losses and zero repetitions", () => {
    const loss = calculateCompoundedScenario(-10, 2);
    expect(loss.ok && loss.compoundedReturnPct).toBeCloseTo(-19);
    expect(calculateCompoundedScenario(10, 0)).toEqual({ ok: true, compoundedReturnPct: 0 });
  });
  it.each([[-100, 1], [10, -1], [10, 1.5], [Infinity, 1], [1e200, 1e10]])(
    "rejects invalid or overflowing scenarios (%s, %s)", (returnPct, trades) => {
      expect(calculateCompoundedScenario(returnPct, trades).ok).toBe(false);
    },
  );
});
