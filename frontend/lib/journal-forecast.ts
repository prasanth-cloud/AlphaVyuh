export type ForecastInputs = {
  portfolioSize: number;
  positionSizePct: number;
  desiredReturnPct: number;
  averageGainPct: number;
  averageLossPct: number;
  winRatePct: number;
};

type InvalidScenario = { ok: false; error: string };

export type JournalForecast = {
  ok: true;
  positionValue: number;
  averageWinCash: number;
  averageLossCash: number;
  payoffRatio: number;
  adjustedPayoffRatio: number | null;
  expectedTradeReturnPct: number;
  expectedPortfolioReturnPct: number;
  expectedTradeReturnCash: number;
  goalCash: number;
  tradesNeeded: number | null;
  expectedWinningTrades: number | null;
  expectedLosingTrades: number | null;
  kellyRiskFractionPct: number;
};

/** Fixed notional, two-outcome expectation; no fees, compounding, or sizing advice. */
export function calculateJournalForecast(input: ForecastInputs): JournalForecast | InvalidScenario {
  if (!Object.values(input).every((value) => typeof value === "number" && Number.isFinite(value))) {
    return { ok: false, error: "Enter a finite number in every forecast field." };
  }
  if (input.portfolioSize <= 0 || input.positionSizePct <= 0 || input.positionSizePct > 100) {
    return { ok: false, error: "Portfolio size must be positive and position allocation must be above 0 and at most 100%." };
  }
  if (input.desiredReturnPct < 0 || input.averageGainPct <= 0 || input.averageLossPct <= 0) {
    return { ok: false, error: "Target return cannot be negative. Average gain and loss magnitudes must be positive." };
  }
  if (input.winRatePct < 0 || input.winRatePct > 100) {
    return { ok: false, error: "Winning percentage must be between 0 and 100%." };
  }

  const winProbability = input.winRatePct / 100;
  const lossProbability = 1 - winProbability;
  const allocation = input.positionSizePct / 100;
  const positionValue = input.portfolioSize * allocation;
  const averageWinCash = positionValue * (input.averageGainPct / 100);
  const averageLossCash = positionValue * (input.averageLossPct / 100);
  const payoffRatio = input.averageGainPct / input.averageLossPct;
  const weightedGain = input.averageGainPct * winProbability;
  const weightedLoss = input.averageLossPct * lossProbability;
  const gainWeight = input.averageGainPct * input.winRatePct;
  const lossWeight = input.averageLossPct * (100 - input.winRatePct);
  const difference = gainWeight - lossWeight;
  if (![gainWeight, lossWeight, difference].every(Number.isFinite)) {
    return { ok: false, error: "These assumptions exceed the supported numeric range." };
  }
  const cancellationTolerance = Number.EPSILON * Math.max(Math.abs(gainWeight), Math.abs(lossWeight)) * 4;
  const expectedTradeReturnPct = Math.abs(difference) <= cancellationTolerance ? 0 : difference / 100;
  const expectedPortfolioReturnPct = expectedTradeReturnPct * allocation;
  const expectedTradeReturnCash = positionValue * (expectedTradeReturnPct / 100);
  const goalCash = input.portfolioSize * (input.desiredReturnPct / 100);
  const rawTrades = goalCash / expectedTradeReturnCash;
  const nearestTrade = Math.round(rawTrades);
  // Rounding the displayed cash must not change counts; stabilize only floating
  // point noise at an integer boundary, then round the required trades upward.
  const countTolerance = Math.min(1e-9, Number.EPSILON * Math.max(1, Math.abs(rawTrades)) * 8);
  const tradeCount = Math.abs(rawTrades - nearestTrade) <= countTolerance
    ? nearestTrade : Math.ceil(rawTrades);
  const tradesNeeded = goalCash === 0 ? 0 : expectedTradeReturnCash > 0 ? tradeCount : null;

  const result: JournalForecast = {
    ok: true,
    positionValue,
    averageWinCash,
    averageLossCash,
    payoffRatio,
    adjustedPayoffRatio: weightedLoss > 0 ? weightedGain / weightedLoss : null,
    expectedTradeReturnPct,
    expectedPortfolioReturnPct,
    expectedTradeReturnCash,
    goalCash,
    tradesNeeded,
    // Expected outcome counts are fractional expectations, not predicted results.
    expectedWinningTrades: tradesNeeded == null ? null : tradesNeeded * winProbability,
    expectedLosingTrades: tradesNeeded == null ? null : tradesNeeded * lossProbability,
    // This is a normalized binary risk fraction, never a position allocation.
    kellyRiskFractionPct: (winProbability - lossProbability / payoffRatio) * 100,
  };
  const values = Object.values(result).filter((value): value is number => typeof value === "number");
  if (values.some((value) => !Number.isFinite(value)) ||
      positionValue <= 0 || averageWinCash <= 0 || averageLossCash <= 0 ||
      (input.desiredReturnPct > 0 && goalCash === 0) ||
      (expectedTradeReturnPct !== 0 && expectedTradeReturnCash === 0) ||
      (tradesNeeded != null && !Number.isSafeInteger(tradesNeeded))) {
    return { ok: false, error: "These assumptions exceed the supported numeric range." };
  }
  return result;
}

/** Reuse the same capital at one assumed return for an integer number of trades. */
export function calculateCompoundedScenario(
  returnPct: number,
  trades: number,
): { ok: true; compoundedReturnPct: number } | InvalidScenario {
  if (!Number.isFinite(returnPct) || returnPct <= -100 || !Number.isSafeInteger(trades) || trades < 0) {
    return { ok: false, error: "Return must be above -100% and repetitions must be a nonnegative whole number." };
  }
  // log1p/expm1 avoid cancellation for small percentages and preserve zero trades.
  const compoundedReturnPct = Math.expm1(Math.log1p(returnPct / 100) * trades) * 100;
  if (!Number.isFinite(compoundedReturnPct)) {
    return { ok: false, error: "This reinvestment scenario exceeds the supported numeric range." };
  }
  return { ok: true, compoundedReturnPct };
}
