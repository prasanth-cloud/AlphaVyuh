"use client";

import { useState } from "react";
import { Check, X, Zap, Sparkles, Crown } from "lucide-react";
import { createPaymentOrder, verifyPayment, getPaymentConfig } from "@/lib/api";

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.Razorpay !== "undefined") {
      resolve(true); return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

type Currency = "INR" | "USD";
type BillingPeriod = "monthly" | "annual";

const PRICES: Record<Currency, Record<BillingPeriod, { pro: string; elite: string }>> = {
  INR: { monthly: { pro: "₹599/mo", elite: "₹4,999/mo" }, annual: { pro: "₹5,999/yr", elite: "₹49,999/yr" } },
  USD: { monthly: { pro: "$29/mo", elite: "$69/mo" }, annual: { pro: "$279/yr", elite: "$699/yr" } },
};

const PRO_FEATURES = [
  "Scanner — 500 results, unlimited",
  "All chart indicators (BB, VWAP, MACD…)",
  "Unlimited watchlists & saved screens",
  "Full journal + AI trade analysis",
  "US stocks (NASDAQ + NYSE)",
];

interface UpgradePromptProps {
  open: boolean;
  onClose: () => void;
  feature?: string;
  onSuccess?: () => void;
  userName?: string;
  userEmail?: string;
}

export default function UpgradePrompt({ open, onClose, feature, onSuccess, userName, userEmail }: UpgradePromptProps) {
  const [currency, setCurrency] = useState<Currency>("INR");
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [paying, setPaying] = useState<"pro" | "elite" | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleUpgrade = async (plan: "pro" | "elite") => {
    setError("");
    if (!RAZORPAY_KEY) {
      setError("Payments not configured. Go to Settings → Billing to use an access code.");
      return;
    }

    const config = await getPaymentConfig();
    if (!config.configured) {
      setError("Payment gateway not configured yet. Try an access code in Settings → Billing.");
      return;
    }

    setPaying(plan);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { setError("Could not load payment gateway"); setPaying(null); return; }

      const order = await createPaymentOrder(plan, currency, period);
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: RAZORPAY_KEY,
          amount: order.amount,
          currency: order.currency,
          name: "AlphaVyuh",
          description: order.label,
          order_id: order.order_id,
          prefill: { name: userName, email: userEmail },
          theme: { color: plan === "pro" ? "#f4f7fb" : "#d97706" },
          handler: async (response: Record<string, string>) => {
            try {
              await verifyPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan,
                currency,
                billing: period,
              });
              onSuccess?.();
              onClose();
              resolve();
            } catch { reject(new Error("Verification failed")); }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
        });
        rzp.open();
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "dismissed") setError(`Payment failed: ${msg}`);
    } finally {
      setPaying(null);
    }
  };

  const prices = PRICES[currency][period];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="upgrade-prompt"
    >
      <div
        className="w-full max-w-[520px] rounded-[16px] p-6 relative"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full"
          style={{ color: "var(--text-secondary)" }}
          data-testid="upgrade-prompt-close"
        >
          <X size={16} />
        </button>

        <div className="text-center mb-5">
          <Sparkles size={24} className="mx-auto mb-2" style={{ color: "var(--accent)" }} />
          <h2 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>
            Upgrade to unlock
          </h2>
          {feature && (
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {feature} requires a Pro or Elite plan.
            </p>
          )}
        </div>

        {/* Currency + period toggles */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
            {(["INR", "USD"] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className="px-3 py-1.5 text-[11px] font-semibold"
                style={currency === c
                  ? { background: "var(--accent)", color: "white" }
                  : { color: "var(--text-tertiary)" }}>
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
            {(["monthly", "annual"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-[11px] font-semibold"
                style={period === p
                  ? { background: "var(--gain)", color: "white" }
                  : { color: "var(--text-tertiary)" }}>
                {p === "monthly" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards side by side */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Pro */}
          <div className="rounded-[12px] p-4 flex flex-col" style={{ background: "var(--surface-2)", border: "1px solid var(--border-default)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} style={{ color: "var(--accent)" }} />
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Pro</span>
            </div>
            <div className="text-[20px] font-bold mb-3" style={{ color: "var(--text-primary)" }}>{prices.pro}</div>
            <ul className="space-y-1.5 flex-1 mb-4">
              {PRO_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <Check size={10} className="mt-0.5 shrink-0" style={{ color: "var(--gain)" }} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleUpgrade("pro")}
              disabled={!!paying}
              className="w-full py-2 rounded-[8px] text-[12px] font-semibold transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)", color: "white" }}
              data-testid="upgrade-prompt-pro"
            >
              {paying === "pro" ? "Processing…" : "Upgrade to Pro"}
            </button>
          </div>

          {/* Elite */}
          <div className="rounded-[12px] p-4 flex flex-col" style={{ background: "var(--surface-2)", border: "1px solid rgba(217,119,6,0.3)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Crown size={14} style={{ color: "#d97706" }} />
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#d97706" }}>Elite</span>
            </div>
            <div className="text-[20px] font-bold mb-3" style={{ color: "var(--text-primary)" }}>{prices.elite}</div>
            <ul className="space-y-1.5 flex-1 mb-4">
              <li className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <Check size={10} className="mt-0.5 shrink-0" style={{ color: "#d97706" }} />
                Everything in Pro
              </li>
              <li className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <Check size={10} className="mt-0.5 shrink-0" style={{ color: "#d97706" }} />
                5 team seats + API access
              </li>
              <li className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <Check size={10} className="mt-0.5 shrink-0" style={{ color: "#d97706" }} />
                Custom alerts + priority data
              </li>
            </ul>
            <button
              onClick={() => handleUpgrade("elite")}
              disabled={!!paying}
              className="w-full py-2 rounded-[8px] text-[12px] font-semibold transition-opacity disabled:opacity-60"
              style={{ background: "#d97706", color: "white" }}
              data-testid="upgrade-prompt-elite"
            >
              {paying === "elite" ? "Processing…" : "Upgrade to Elite"}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-[12px] text-center mb-3 px-3 py-2 rounded-[8px]" style={{ background: "rgba(229,56,59,0.1)", color: "var(--loss)" }} data-testid="upgrade-prompt-error">
            {error}
          </div>
        )}

        <p className="text-[11px] text-center" style={{ color: "var(--text-tertiary)" }}>
          Or apply an access code in <a href="/settings?tab=billing" className="underline" style={{ color: "var(--accent)" }}>Settings → Billing</a>
        </p>
      </div>
    </div>
  );
}
