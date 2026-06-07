"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { placeOrder, getBrokerStatus } from "@/lib/api";
import type { PlaceOrderRequest, OrderResult } from "@/lib/api";
import { DataProvenanceBadge } from "@/components/ui";
import { trackEvent } from "@/lib/analytics";
import { accountDataErrorMessage } from "@/lib/account-data-status";

const SETUP_TYPES = [
  { value: "", label: "— Select setup —" },
  { value: "breakout", label: "Breakout" },
  { value: "pullback", label: "Pullback" },
  { value: "reversal", label: "Reversal" },
  { value: "momentum", label: "Momentum" },
  { value: "other",    label: "Other" },
];

type Props = {
  symbol:      string;
  currentPrice: number;
  defaultSide: "buy" | "sell";
  initialPlan?: {
    entry?: number | null;
    stop?: number | null;
    target?: number | null;
  };
  onClose:     () => void;
  onFilled:    (result: OrderResult) => void;
};

export default function OrderModal({ symbol, currentPrice, defaultSide, initialPlan, onClose, onFilled }: Props) {
  const [side, setSide]             = useState<"buy" | "sell">(defaultSide);
  const [quantity, setQuantity]     = useState("1");
  const [price, setPrice]           = useState((initialPlan?.entry ?? currentPrice).toFixed(2));
  const [stopLoss, setStopLoss]     = useState(initialPlan?.stop != null ? initialPlan.stop.toFixed(2) : "");
  const [target, setTarget]         = useState(initialPlan?.target != null ? initialPlan.target.toFixed(2) : "");
  const [setupType, setSetupType]   = useState("");
  const [notes, setNotes]           = useState("");
  const [placing, setPlacing]       = useState(false);
  const [error, setError]           = useState("");
  const [brokerName, setBrokerName] = useState<string | null>(null);
  const [brokerLive, setBrokerLive] = useState(false);
  const [brokerStatusError, setBrokerStatusError] = useState<string | null>(null);
  const [brokerTokenExpired, setBrokerTokenExpired] = useState(false);
  const [planAllowsBroker, setPlanAllowsBroker] = useState(true);
  const [liveOrderEnabled, setLiveOrderEnabled] = useState(false);
  const liveConfirmed = false;

  useEffect(() => {
    getBrokerStatus()
      .then(s => {
        setBrokerLive(Boolean(s.connected && s.broker));
        setBrokerTokenExpired(Boolean(s.token_expired));
        setPlanAllowsBroker(s.plan_allows_broker !== false);
        setLiveOrderEnabled(Boolean(s.live_order_enabled));
        setBrokerStatusError(null);
        if (s.broker) setBrokerName(s.broker);
      })
      .catch((error) => {
        setBrokerLive(false);
        setBrokerTokenExpired(false);
        setLiveOrderEnabled(false);
        setBrokerStatusError(accountDataErrorMessage(error, "Broker status is temporarily unavailable. Existing broker access is not being treated as disconnected."));
      });
  }, []);

  useEffect(() => {
    setSide(defaultSide);
  }, [defaultSide]);

  useEffect(() => {
    setPrice((initialPlan?.entry ?? currentPrice).toFixed(2));
    setStopLoss(initialPlan?.stop != null ? initialPlan.stop.toFixed(2) : "");
    setTarget(initialPlan?.target != null ? initialPlan.target.toFixed(2) : "");
  }, [currentPrice, initialPlan?.entry, initialPlan?.stop, initialPlan?.target]);

  const priceNum = parseFloat(price) || 0;
  const slNum    = parseFloat(stopLoss) || 0;
  const tgtNum   = parseFloat(target) || 0;
  const qtyNum   = parseInt(quantity) || 1;

  const risk   = slNum  > 0 ? Math.abs(priceNum - slNum) * qtyNum  : null;
  const reward = tgtNum > 0 ? Math.abs(tgtNum   - priceNum) * qtyNum : null;
  const rr     = risk && reward && risk > 0 ? (reward / risk).toFixed(2) : null;
  const invest = priceNum * qtyNum;
  const brokerLabel = brokerName ? brokerName.charAt(0).toUpperCase() + brokerName.slice(1) : "Broker";
  const executionPath = brokerStatusError
    ? "Broker unknown · journal capture"
    : brokerLive && brokerName
    ? liveOrderEnabled
      ? `${brokerLabel} explicit confirm`
      : `${brokerLabel} import-only`
    : brokerTokenExpired
      ? "Token expired · journal capture"
      : "Simulated capture";
  const canRouteLive = false;

  async function submit() {
    if (!quantity || !price || parseFloat(price) <= 0 || parseInt(quantity) <= 0) {
      setError("Enter a valid price and quantity");
      return;
    }
    setPlacing(true);
    setError("");
    try {
      const req: PlaceOrderRequest = {
        symbol,
        side,
        quantity: qtyNum,
        price:    priceNum,
        order_type: "market",
        source_page: "chart",
        source_context: symbol,
        live_confirmed: canRouteLive && liveConfirmed,
        ...(slNum  > 0 ? { stop_loss:    slNum  } : {}),
        ...(tgtNum > 0 ? { target_price: tgtNum } : {}),
        ...(setupType   ? { setup_type:  setupType } : {}),
        ...(notes       ? { notes }               : {}),
      };
      const result = await placeOrder(req);
      trackEvent(canRouteLive && liveConfirmed ? "broker_order_submitted" : "mock_order_drafted", { source: "chart", symbol, side, broker: brokerName ?? "simulated" });
      onFilled(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setPlacing(false);
    }
  }

  const isBuy = side === "buy";
  const accent = isBuy ? "#26a65b" : "#e5383b";
  const accentBg = isBuy ? "#edfaf3" : "#fff0f0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-[14px] shadow-2xl w-[380px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0ee]">
          <div className="flex items-center gap-3">
            <span className="text-[16px] font-bold text-[#1c1c1a]">{symbol}</span>
            <span className="text-[12px] text-[#888]">₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <button onClick={onClose} className="text-[#aaa] hover:text-[#555] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-[8px] border border-[#f2d7ad] bg-[#fff8ec] px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a5f07]">Execution guardrail</span>
              <DataProvenanceBadge kind="broker-import" compact />
            </div>
            <p className="text-[11px] leading-5 text-[#7b5a2b]">
              {planAllowsBroker
                ? canRouteLive
                  ? "Broker import can capture filled trades. Place any real trade directly in your broker terminal."
                  : "Broker import can capture filled trades. Live and sandbox order placement are not enabled yet."
                : "Broker integration requires Pro or Elite. Free accounts can still use chart planning and journaling."}
            </p>
          </div>

          {brokerStatusError && (
            <div data-testid="chart-order-broker-status-warning" className="rounded-[8px] border border-[#f2d7ad] bg-[#fff8ec] px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#9a5f07] mb-1">Broker status unavailable</div>
              <p className="text-[11px] leading-5 text-[#7b5a2b]">
                {brokerStatusError} Existing broker access is not being treated as disconnected; this order ticket will save a journal draft only.
              </p>
            </div>
          )}

          <div className="rounded-[8px] border border-[#e7e7e3] bg-[#fafaf8] px-3 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#777] mb-2">Order workflow</div>
            <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-semibold text-[#777]">
              {[
                executionPath,
                "No broker submit",
                "Journal draft",
                "Pattern review after close",
              ].map((step, idx) => (
                <div key={step} className="rounded-[6px] px-1.5 py-2 bg-white border border-[#eeeeea]">
                  <div className="mx-auto mb-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#1c1c1a] text-[9px] text-white">{idx + 1}</div>
                  {step}
                </div>
              ))}
            </div>
          </div>

          {/* BUY / SELL toggle */}
          <div className="flex gap-2">
            {(["buy", "sell"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className="flex-1 py-2.5 rounded-[8px] text-[14px] font-bold transition-all"
                style={side === s
                  ? { background: s === "buy" ? "#26a65b" : "#e5383b", color: "white" }
                  : { background: "#f7f7f5", color: "#aaa" }
                }
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Price */}
          <div>
            <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide block mb-1">
              Price (₹)
            </label>
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              step="0.05"
              className="w-full text-[14px] font-semibold border border-[#e2e2df] rounded-[8px] px-3 py-2.5 outline-none focus:border-[#f4f7fb] tabular-nums"
              style={{ borderColor: accent + "66" }}
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide block mb-1">
              Quantity
            </label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              min="1"
              step="1"
              className="w-full text-[14px] border border-[#e2e2df] rounded-[8px] px-3 py-2.5 outline-none focus:border-[#f4f7fb]"
            />
          </div>

          {/* Investment summary */}
          {invest > 0 && (
            <div className="rounded-[8px] px-3 py-2.5 text-[12px] flex items-center justify-between"
              style={{ background: accentBg }}>
              <span style={{ color: accent }} className="font-semibold">
                Total investment: ₹{invest.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              {rr && (
                <span className="text-[#888]">R:R = {rr}</span>
              )}
            </div>
          )}

          {/* Stop Loss & Target */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide block mb-1">
                Stop Loss
              </label>
              <input
                type="number"
                value={stopLoss}
                onChange={e => setStopLoss(e.target.value)}
                placeholder="Optional"
                step="0.05"
                className="w-full text-[13px] border border-[#e2e2df] rounded-[8px] px-3 py-2 outline-none focus:border-[#e5383b]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide block mb-1">
                Target
              </label>
              <input
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="Optional"
                step="0.05"
                className="w-full text-[13px] border border-[#e2e2df] rounded-[8px] px-3 py-2 outline-none focus:border-[#26a65b]"
              />
            </div>
          </div>

          {/* Risk breakdown */}
          {(risk || reward) && (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {risk   && <div className="text-center py-1.5 rounded-md bg-[#fff0f0] text-[#e5383b] font-semibold">Risk ₹{risk.toFixed(0)}</div>}
              {reward && <div className="text-center py-1.5 rounded-md bg-[#edfaf3] text-[#26a65b] font-semibold">Reward ₹{reward.toFixed(0)}</div>}
            </div>
          )}

          <div className="rounded-[8px] border border-[#f2d7ad] bg-[#fff8ec] px-3 py-2.5">
            <span className="text-[11px] leading-5 text-[#7b5a2b]">
              This creates a journal capture draft only. Broker execution is not enabled in AlphaVyuh.
            </span>
          </div>

          {!planAllowsBroker && (
            <button
              type="button"
              onClick={() => { window.location.href = "/settings/billing"; }}
              className="w-full py-2.5 rounded-[8px] text-[13px] font-bold transition-opacity"
              style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
            >
              Upgrade to Pro for broker integration
            </button>
          )}

          {/* Setup */}
          <div>
            <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide block mb-1">
              Setup Type
            </label>
            <select
              value={setupType}
              onChange={e => setSetupType(e.target.value)}
              className="w-full text-[13px] border border-[#e2e2df] rounded-[8px] px-3 py-2.5 outline-none bg-white focus:border-[#f4f7fb]"
            >
              {SETUP_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-semibold text-[#888] uppercase tracking-wide block mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Entry rationale, market context…"
              rows={2}
              className="w-full text-[13px] border border-[#e2e2df] rounded-[8px] px-3 py-2 outline-none resize-none focus:border-[#f4f7fb]"
            />
          </div>

          {error && <div className="text-[12px] text-[#e5383b] bg-[#fff0f0] rounded-lg px-3 py-2">{error}</div>}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={placing || (canRouteLive && !liveConfirmed)}
            className="w-full py-3 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
            style={{ background: accent }}
          >
            {placing
              ? canRouteLive && liveConfirmed ? "Submitting order..." : "Saving journal draft..."
              : canRouteLive ? `${side.toUpperCase()} ${quantity || ""} ${symbol} via ${brokerLabel}` : `Save ${side.toUpperCase()} journal draft`}
          </button>

          <p className="text-[10px] text-[#ccc] text-center">
            {brokerLive && brokerName
              ? canRouteLive ? `${brokerLabel} is connected. Submission happens only after explicit confirmation.` : `${brokerLabel} is connected for import. This modal records a journal capture draft.`
              : brokerTokenExpired
                ? `Journal capture draft only — your ${brokerLabel} token expired.`
                : "Journal capture draft — ready for post-trade review"}
          </p>
        </div>
      </div>
    </div>
  );
}
