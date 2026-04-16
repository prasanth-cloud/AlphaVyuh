"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Zap, Crown, Sparkles } from "lucide-react";
import { getPlanStatus, createPaymentOrder, verifyPayment } from "@/lib/api";
import type { PlanStatus } from "@/lib/api";
import { createClient } from "@/lib/supabase";

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => { open(): void };
  }
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window.Razorpay !== "undefined") { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const PLANS = [
  {
    id: "free" as const,
    label: "Free",
    price: "₹0",
    period: "",
    color: "#888",
    bg: "#f7f7f5",
    features: [
      "Scanner — up to 50 results",
      "5 saved screens",
      "1 watchlist",
      "Basic charts (EMA + RSI)",
      "3-month journal history",
    ],
    cta: "Current plan",
    ctaDisabled: true,
  },
  {
    id: "pro" as const,
    label: "Pro",
    price: "₹1,999",
    period: "/month",
    color: "#5b63f5",
    bg: "#eeeffe",
    features: [
      "Scanner — 500 results, unlimited",
      "Unlimited saved screens",
      "Unlimited watchlists",
      "All chart indicators (BB, VWAP, MACD…)",
      "Full journal + AI mistake analysis",
      "Sector breadth overlay",
      "Options strategy builder",
    ],
    cta: "Upgrade to Pro",
    ctaDisabled: false,
  },
  {
    id: "elite" as const,
    label: "Elite",
    price: "₹4,999",
    period: "/month",
    color: "#d97706",
    bg: "#fff8ec",
    features: [
      "Everything in Pro",
      "5 seats (team accounts)",
      "API access",
      "Priority data feed",
      "Custom scan alerts (email + Telegram)",
      "White-label journal exports",
      "Dedicated support",
    ],
    cta: "Upgrade to Elite",
    ctaDisabled: false,
  },
];

export default function BillingPage() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: { user } }, planData] = await Promise.all([
      supabase.auth.getUser(),
      getPlanStatus(),
    ]);
    setUserEmail(user?.email ?? "");
    setUserName(user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "");
    setStatus(planData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpgrade = async (planId: "pro" | "elite") => {
    if (!RAZORPAY_KEY) {
      showToast("Payments not configured yet — coming soon!");
      return;
    }
    setPaying(planId);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { showToast("Could not load payment gateway"); setPaying(null); return; }

      const order = await createPaymentOrder(planId);

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: RAZORPAY_KEY,
          amount: order.amount,
          currency: order.currency,
          name: "Artha",
          description: order.label,
          order_id: order.order_id,
          prefill: { name: userName, email: userEmail },
          theme: { color: planId === "pro" ? "#5b63f5" : "#d97706" },
          handler: async (response: Record<string, string>) => {
            try {
              await verifyPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: planId,
              });
              showToast(`${planId.charAt(0).toUpperCase() + planId.slice(1)} plan activated!`);
              await load();
              resolve();
            } catch {
              reject(new Error("Verification failed"));
            }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
        });
        rzp.open();
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "dismissed") showToast(`Payment failed: ${msg}`);
    } finally {
      setPaying(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#f2f2f0] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin" />
      </div>
    );
  }

  const currentPlan = status?.plan ?? "free";
  const expiresAt = status?.expires_at
    ? new Date(status.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="min-h-full bg-[#f2f2f0]">
      {/* Nav */}
      <div className="h-[44px] bg-white border-b border-[#e2e2df] flex items-center px-5 gap-3">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-[13px] text-[#888] hover:text-[#1c1c1a]">
          <ArrowLeft size={13} /> Dashboard
        </Link>
        <span className="text-[#ddd]">/</span>
        <span className="text-[13px] text-[#1c1c1a] font-medium">Billing & Plan</span>
      </div>

      <div className="max-w-[860px] mx-auto px-5 py-8">
        {/* Current plan banner */}
        <div className="bg-white border border-[#e2e2df] rounded-[12px] p-5 mb-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            {currentPlan === "free" && <Zap size={18} className="text-[#888]" />}
            {currentPlan === "pro" && <Sparkles size={18} className="text-[#5b63f5]" />}
            {currentPlan === "elite" && <Crown size={18} className="text-[#d97706]" />}
            <div>
              <div className="text-[14px] font-semibold text-[#1c1c1a] capitalize">
                {currentPlan} Plan
                {currentPlan !== "free" && (
                  <span
                    className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: currentPlan === "pro" ? "#eeeffe" : "#fff8ec",
                      color: currentPlan === "pro" ? "#5b63f5" : "#d97706",
                    }}
                  >
                    Active
                  </span>
                )}
              </div>
              {expiresAt && (
                <div className="text-[12px] text-[#aaa] mt-0.5">Renews {expiresAt}</div>
              )}
              {currentPlan === "free" && (
                <div className="text-[12px] text-[#aaa] mt-0.5">Upgrade to unlock all features</div>
              )}
            </div>
          </div>
          <div className="text-[12px] text-[#888]">{userEmail}</div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isHigher =
              (currentPlan === "free" && plan.id !== "free") ||
              (currentPlan === "pro" && plan.id === "elite");

            return (
              <div
                key={plan.id}
                className="bg-white border rounded-[14px] p-5 flex flex-col"
                style={{
                  borderColor: isCurrent ? plan.color : "#e2e2df",
                  borderWidth: isCurrent ? 2 : 1,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: plan.bg, color: plan.color }}
                  >
                    {plan.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[11px] text-[#888] font-medium">Current</span>
                  )}
                </div>

                <div className="mb-4">
                  <span className="text-[28px] font-bold tracking-tight text-[#1c1c1a]">{plan.price}</span>
                  {plan.period && <span className="text-[13px] text-[#aaa]">{plan.period}</span>}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-2 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12px] text-[#555]">
                      <Check size={12} className="mt-0.5 shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div
                    className="w-full text-center py-2 rounded-[8px] text-[13px] font-medium"
                    style={{ background: plan.bg, color: plan.color }}
                  >
                    Current plan
                  </div>
                ) : isHigher ? (
                  <button
                    onClick={() => handleUpgrade(plan.id as "pro" | "elite")}
                    disabled={!!paying}
                    className="w-full py-2 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                    style={{ background: plan.color }}
                  >
                    {paying === plan.id ? "Processing…" : plan.cta}
                  </button>
                ) : (
                  <div className="w-full text-center py-2 rounded-[8px] text-[13px] text-[#ccc] bg-[#f7f7f5]">
                    Downgrade available on expiry
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer notes */}
        <div className="mt-6 text-[12px] text-[#aaa] space-y-1">
          <p>Payments processed by Razorpay. Secure, encrypted, and instant.</p>
          <p>Plans auto-expire after 30 days. Cancel anytime — no questions asked.</p>
          {!RAZORPAY_KEY && (
            <p className="text-[#e5383b]">
              Payments are in test mode. Add NEXT_PUBLIC_RAZORPAY_KEY_ID to enable live payments.
            </p>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1c1c1a] text-white text-[13px] px-4 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
