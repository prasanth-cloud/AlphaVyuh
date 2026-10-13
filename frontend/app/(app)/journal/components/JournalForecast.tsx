"use client";

import { useId, useState } from "react";
import { Card } from "@/components/ui";
import type { JournalTradeMetrics } from "@/lib/api/types";
import { calculateCompoundedScenario, calculateJournalForecast, type ForecastInputs } from "@/lib/journal-forecast";
import { formatCurrency, formatPct, formatRatio, toneForSigned } from "./analytics-format";

const fields: { key: keyof ForecastInputs; label: string; unit: string }[] = [
  { key: "portfolioSize", label: "Portfolio size", unit: "₹" },
  { key: "positionSizePct", label: "Position allocation", unit: "%" },
  { key: "desiredReturnPct", label: "Target portfolio return", unit: "%" },
  { key: "averageGainPct", label: "Average gain", unit: "%" },
  { key: "averageLossPct", label: "Average loss", unit: "% magnitude" },
  { key: "winRatePct", label: "Winning trades", unit: "%" },
];
const initialInputs = Object.fromEntries(fields.map(field => [field.key, ""])) as Record<keyof ForecastInputs, string>;
const inputStyle = {
  width: "100%", minWidth: 0, padding: "9px 10px", marginTop: 5,
  borderRadius: "var(--radius-sm)", background: "var(--surface-1)",
  border: "1px solid var(--border-default)", color: "var(--text-primary)", fontSize: 13,
};

function forecastPct(value: number) {
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 3 })}%`;
}

export function JournalForecast({ metrics }: { metrics?: JournalTradeMetrics | null }) {
  const id = useId();
  const [inputs, setInputs] = useState(initialInputs);
  const [reinvestment, setReinvestment] = useState({ returnPct: "", trades: "" });
  const canUseAverages = metrics != null && metrics.wins > 0 && metrics.losses > 0 &&
    metrics.avg_gain_pct != null && Number.isFinite(metrics.avg_gain_pct) && metrics.avg_gain_pct > 0 &&
    metrics.avg_loss_pct != null && Number.isFinite(metrics.avg_loss_pct) && metrics.avg_loss_pct > 0;
  const ready = fields.every(field => inputs[field.key].trim() !== "");
  const forecast = ready ? calculateJournalForecast({
    portfolioSize: Number(inputs.portfolioSize), positionSizePct: Number(inputs.positionSizePct),
    desiredReturnPct: Number(inputs.desiredReturnPct), averageGainPct: Number(inputs.averageGainPct),
    averageLossPct: Number(inputs.averageLossPct), winRatePct: Number(inputs.winRatePct),
  }) : null;
  const compounded = reinvestment.returnPct.trim() && reinvestment.trades.trim()
    ? calculateCompoundedScenario(Number(reinvestment.returnPct), Number(reinvestment.trades)) : null;

  return (
    <Card padding="lg" data-testid="journal-forecast">
      <h2 className="heading-card" style={{ marginBottom: 4 }}>Result-based forecast</h2>
      <p className="caption" style={{ maxWidth: 780, marginBottom: 16 }}>
        Explore your own assumptions. This fixed-notional expectation model is independent of your journal and does not predict outcomes or recommend a position size.
      </p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Forecast assumptions</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
          {fields.map(field => (
            <label key={field.key} htmlFor={`${id}-${field.key}`} style={{ display: "block", minWidth: 0 }}>
              <span className="label">{field.label} ({field.unit})</span>
              <input id={`${id}-${field.key}`} type="number" inputMode="decimal" step="any" min={0}
                max={field.key === "positionSizePct" || field.key === "winRatePct" ? 100 : undefined}
                value={inputs[field.key]} style={inputStyle}
                onChange={event => setInputs(previous => ({ ...previous, [field.key]: event.target.value }))} />
            </label>
          ))}
        </div>
      </fieldset>
      {canUseAverages && metrics && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button type="button" className="workspace-chip-button" onClick={() => setInputs(previous => ({
            ...previous, averageGainPct: String(metrics.avg_gain_pct), averageLossPct: String(metrics.avg_loss_pct),
            winRatePct: (metrics.wins / (metrics.wins + metrics.losses) * 100).toFixed(2),
          }))}>Use journal averages</button>
          <span className="caption">Fills gain, loss, and winning percentage only; you choose equity, allocation, and target.</span>
          {metrics.breakevens > 0 && <p className="caption" style={{ width: "100%", margin: 0 }}>Winning percentage uses decisive trades; breakevens are excluded from this two-outcome scenario.</p>}
        </div>
      )}
      <div aria-live="polite" style={{ marginTop: 16 }}>
        {!forecast ? <p className="caption">Enter all six assumptions to calculate the scenario. Fields start blank.</p>
          : !forecast.ok ? <p role="alert" style={{ color: "var(--warn)", fontSize: 13 }}>{forecast.error}</p>
          : <>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 165px), 1fr))", gap: 10, margin: 0 }}>
              {[
                { label: "Position notional", value: `₹${forecast.positionValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
                { label: "Average cash win", value: formatCurrency(forecast.averageWinCash) },
                { label: "Average cash loss", value: formatCurrency(-forecast.averageLossCash) },
                { label: "Expected cash / trade", value: formatCurrency(forecast.expectedTradeReturnCash), color: toneForSigned(forecast.expectedTradeReturnCash) },
                { label: "Expected position return / trade", value: forecastPct(forecast.expectedTradeReturnPct) },
                { label: "Expected portfolio return / trade", value: forecastPct(forecast.expectedPortfolioReturnPct) },
                { label: "Target profit", value: formatCurrency(forecast.goalCash) },
                { label: "Trades for expected profit to reach target", value: forecast.tradesNeeded == null ? "Not reachable" : forecast.tradesNeeded.toLocaleString("en-IN") },
                { label: "Expected wins / losses", value: forecast.expectedWinningTrades == null || forecast.expectedLosingTrades == null ? "—" : `${forecast.expectedWinningTrades.toFixed(2)} / ${forecast.expectedLosingTrades.toFixed(2)}` },
                { label: "Assumed payoff / adjusted ratio", value: `${formatRatio(forecast.payoffRatio)} / ${formatRatio(forecast.adjustedPayoffRatio)}` },
              ].map(item => (
                <div key={item.label} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", minWidth: 0 }}>
                  <dt className="caption">{item.label}</dt>
                  <dd className="mono" style={{ margin: "5px 0 0", fontSize: 16, fontWeight: 600, color: item.color ?? "var(--text-primary)", overflowWrap: "anywhere" }}>{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="caption" style={{ marginTop: 10 }}>Trade count rounds up from expected profit. Fractional win/loss counts are expectations, not promised sequences. A non-positive expectation cannot fund a positive target.</p>
            <details style={{ marginTop: 12, fontSize: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-secondary)" }}>Model assumptions and theoretical risk fraction</summary>
              <p className="caption" style={{ marginTop: 8 }}>Assumes stationary, independent win/loss outcomes and fixed starting notional. Excludes fees, slippage, gaps, changing exposure, and compounding.</p>
              <p className="caption" style={{ marginTop: 6 }}>Theoretical normalized risk fraction: {formatPct(forecast.kellyRiskFractionPct)}. This two-outcome mathematical reference is neither a portfolio allocation nor a sizing recommendation.</p>
            </details>
          </>}
      </div>
      <details style={{ marginTop: 22, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Reinvestment and turnover what-if</summary>
        <p className="caption" style={{ margin: "10px 0" }}>A separate scenario that reinvests the same assumed return for a fixed count. It does not compound the forecast above.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
          <label htmlFor={`${id}-reinvest-return`} className="label">Return per reinvestment (%)
            <input id={`${id}-reinvest-return`} type="number" step="any" value={reinvestment.returnPct} style={inputStyle}
              onChange={event => setReinvestment(previous => ({ ...previous, returnPct: event.target.value }))} />
          </label>
          <label htmlFor={`${id}-reinvest-count`} className="label">Reinvestment count
            <input id={`${id}-reinvest-count`} type="number" step={1} min={0} value={reinvestment.trades} style={inputStyle}
              onChange={event => setReinvestment(previous => ({ ...previous, trades: event.target.value }))} />
          </label>
        </div>
        <div aria-live="polite" style={{ marginTop: 12 }}>
          {compounded && !compounded.ok ? <p role="alert" className="caption" style={{ color: "var(--warn)" }}>{compounded.error}</p>
              : compounded?.ok ? <p className="mono">Compounded return: {forecastPct(compounded.compoundedReturnPct)}</p>
              : <p className="caption">Enter a return and count to compare reinvestment assumptions.</p>}
        </div>
      </details>
    </Card>
  );
}
