import type {
  JournalAnalytics,
  JournalMetricCoverage,
  JournalTradeDistribution,
  JournalTradeMetrics,
} from "@/lib/api/types";

const unavailable = () => new Error("Journal analytics are temporarily unavailable.");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw unavailable();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw unavailable();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw unavailable();
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw unavailable();
  return value;
}

function count(value: unknown): number {
  const result = number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw unavailable();
  return result;
}

function nullableNumber(value: unknown, nonnegative = false): number | null {
  if (value === null) return null;
  const result = number(value);
  if (nonnegative && result < 0) throw unavailable();
  return result;
}

function rate(value: unknown): number | null {
  const result = nullableNumber(value, true);
  if (result !== null && result > 100) throw unavailable();
  return result;
}

function tradeMetrics(value: unknown): JournalTradeMetrics {
  const row = record(value);
  const result: JournalTradeMetrics = {
    closed_trades: count(row.closed_trades),
    eligible_trades: count(row.eligible_trades),
    return_trade_count: count(row.return_trade_count),
    cash_trade_count: count(row.cash_trade_count),
    wins: count(row.wins),
    losses: count(row.losses),
    breakevens: count(row.breakevens),
    win_rate_pct: rate(row.win_rate_pct),
    loss_rate_pct: rate(row.loss_rate_pct),
    avg_gain_pct: nullableNumber(row.avg_gain_pct, true),
    avg_loss_pct: nullableNumber(row.avg_loss_pct, true),
    largest_gain_pct: nullableNumber(row.largest_gain_pct, true),
    largest_loss_pct: nullableNumber(row.largest_loss_pct, true),
    avg_win_cash: nullableNumber(row.avg_win_cash, true),
    avg_loss_cash: nullableNumber(row.avg_loss_cash, true),
    expectancy_pct: nullableNumber(row.expectancy_pct),
    expectancy_cash: nullableNumber(row.expectancy_cash),
    profit_factor_cash: row.profit_factor_cash === undefined ? null : nullableNumber(row.profit_factor_cash, true),
    payoff_ratio: nullableNumber(row.payoff_ratio, true),
    adjusted_win_loss_ratio: nullableNumber(row.adjusted_win_loss_ratio, true),
    avg_winner_holding_days: nullableNumber(row.avg_winner_holding_days, true),
    avg_loser_holding_days: nullableNumber(row.avg_loser_holding_days, true),
    winner_holding_count: count(row.winner_holding_count),
    loser_holding_count: count(row.loser_holding_count),
  };
  if (
    result.eligible_trades > result.closed_trades ||
    result.return_trade_count > result.eligible_trades ||
    result.cash_trade_count > result.eligible_trades ||
    result.wins + result.losses + result.breakevens !== result.return_trade_count ||
    result.winner_holding_count > result.wins ||
    result.loser_holding_count > result.losses
  ) throw unavailable();
  return result;
}

function coverage(value: unknown): JournalMetricCoverage {
  const row = record(value);
  const result: JournalMetricCoverage = {
    closed_trades: count(row.closed_trades),
    eligible_trades: count(row.eligible_trades),
    return_trade_count: count(row.return_trade_count),
    cash_trade_count: count(row.cash_trade_count),
    unknown_exit_date_count: count(row.unknown_exit_date_count),
    future_exit_date_count: count(row.future_exit_date_count),
    missing_return_count: count(row.missing_return_count),
    missing_cash_pnl_count: count(row.missing_cash_pnl_count),
  };
  if (
    result.eligible_trades + result.unknown_exit_date_count + result.future_exit_date_count !== result.closed_trades ||
    result.return_trade_count + result.missing_return_count !== result.eligible_trades ||
    result.cash_trade_count + result.missing_cash_pnl_count !== result.eligible_trades
  ) throw unavailable();
  return result;
}

function distribution(value: unknown): JournalTradeDistribution {
  const row = record(value);
  const result: JournalTradeDistribution = {
    returns_pct: list(row.returns_pct).map(number),
    gain_count: count(row.gain_count),
    loss_count: count(row.loss_count),
    breakeven_count: count(row.breakeven_count),
    missing_return_count: count(row.missing_return_count),
  };
  if (result.gain_count + result.loss_count + result.breakeven_count !== result.returns_pct.length) {
    throw unavailable();
  }
  return result;
}

/** Reject corrupt known fields while preserving older servers' missing additions as unknown. */
export function parseJournalAnalytics(value: unknown): JournalAnalytics {
  const payload = record(value);
  return {
    equity_curve: list(payload.equity_curve).map((value) => {
      const row = record(value);
      return { date: text(row.date), cumulative_pnl: number(row.cumulative_pnl) };
    }),
    setup_breakdown: list(payload.setup_breakdown).map((value) => {
      const row = record(value);
      const winRate = rate(row.win_rate);
      if (winRate === null) throw unavailable();
      return {
        setup: text(row.setup), trades: count(row.trades), wins: count(row.wins),
        win_rate: winRate, total_pnl: number(row.total_pnl), avg_pnl: number(row.avg_pnl),
        avg_holding_days: row.avg_holding_days === undefined ? null : nullableNumber(row.avg_holding_days),
        avg_risk_reward: row.avg_risk_reward === undefined ? null : nullableNumber(row.avg_risk_reward),
      };
    }),
    monthly_pnl: list(payload.monthly_pnl).map((value) => {
      const row = record(value);
      return { month: text(row.month), pnl: number(row.pnl) };
    }),
    drawdown_curve: list(payload.drawdown_curve).map((value) => {
      const row = record(value);
      return { date: text(row.date), drawdown: number(row.drawdown), drawdown_pct: nullableNumber(row.drawdown_pct) };
    }),
    max_drawdown: nullableNumber(payload.max_drawdown),
    longest_dd_days: count(payload.longest_dd_days),
    recovery_factor: nullableNumber(payload.recovery_factor),
    profit_factor: nullableNumber(payload.profit_factor),
    trading_edge: payload.trading_edge == null ? null : tradeMetrics(payload.trading_edge),
    monthly_tracker: payload.monthly_tracker === undefined ? undefined : list(payload.monthly_tracker).map((value) => {
      const row = record(value);
      const month = text(row.month);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw unavailable();
      return { month, ...tradeMetrics(row) };
    }),
    trade_distribution: payload.trade_distribution == null ? null : distribution(payload.trade_distribution),
    metric_coverage: payload.metric_coverage == null ? null : coverage(payload.metric_coverage),
  };
}
