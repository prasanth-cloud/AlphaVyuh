"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Zap, Sparkles, Crown, Copy, Gift } from "lucide-react";
import {
  getMe, updateMe,
  getPlanStatus, createPaymentOrder, verifyPayment, getReferralCode,
  getPaymentConfig, applyAccessPlan,
  type UserProfile, type PlanStatus, type PaymentConfig,
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { EyebrowLabel } from "@/components/ui";

// ── Razorpay ─────────────────────────────────────────────────────────────────

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


export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-full flex items-center justify-center py-20" style={{ background: "var(--app-bg)" }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#f4f7fb", borderTopColor: "transparent" }} />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

// ── Billing plan data ─────────────────────────────────────────────────────────

type PlanId = "free" | "pro" | "elite";
type Currency = "INR" | "USD";
type BillingPeriod = "monthly" | "annual";

const PLAN_PRICES: Record<Currency, Record<BillingPeriod, Record<PlanId, { price: string; period: string; savings?: string }>>> = {
  INR: {
    monthly: {
      free:  { price: "₹0",      period: "" },
      pro:   { price: "₹1,999",  period: "/month" },
      elite: { price: "₹4,999",  period: "/month" },
    },
    annual: {
      free:  { price: "₹0",      period: "" },
      pro:   { price: "₹19,999", period: "/year", savings: "Save 2 months" },
      elite: { price: "₹49,999", period: "/year", savings: "Save 2 months" },
    },
  },
  USD: {
    monthly: {
      free:  { price: "$0",   period: "" },
      pro:   { price: "$29",  period: "/month" },
      elite: { price: "$69",  period: "/month" },
    },
    annual: {
      free:  { price: "$0",   period: "" },
      pro:   { price: "$279", period: "/year", savings: "Save $69" },
      elite: { price: "$699", period: "/year", savings: "Save $129" },
    },
  },
};

const PLAN_META: { id: PlanId; label: string; color: string; accentBg: string; features: string[] }[] = [
  {
    id: "free", label: "Free", color: "var(--app-text3)", accentBg: "var(--app-surface3)",
    features: [
      "Scanner — up to 50 results",
      "5 saved screens",
      "1 watchlist",
      "Basic charts (EMA + RSI)",
      "3-month journal history",
    ],
  },
  {
    id: "pro", label: "Pro", color: "#f4f7fb", accentBg: "rgba(139,150,166,0.12)",
    features: [
      "Scanner — 500 results, unlimited",
      "Unlimited saved screens",
      "Unlimited watchlists",
      "All chart indicators (BB, VWAP, MACD…)",
      "Full journal + trade mistake analysis",
      "Sector breadth overlay",
      "Options strategy builder",
      "US stocks (NASDAQ + NYSE)",
    ],
  },
  {
    id: "elite", label: "Elite", color: "#d97706", accentBg: "rgba(217,119,6,0.12)",
    features: [
      "Everything in Pro",
      "5 seats (team accounts)",
      "API access",
      "Priority data feed",
      "Custom scan alerts (email + Telegram)",
      "White-label journal exports",
      "Dedicated support",
    ],
  },
];

// ── Input style helper ────────────────────────────────────────────────────────

const inputCls = "w-full text-[13px] rounded-[8px] px-3 py-2.5 outline-none transition-colors";
const inputStyle = { background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" };

// ── Main settings page ────────────────────────────────────────────────────────

type Tab = "profile" | "broker" | "billing";

function SettingsContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: Tab = (rawTab === "profile" || rawTab === "broker" || rawTab === "billing") ? rawTab : "profile";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [toast, setToast] = useState<{ msg: string; ok?: boolean } | null>(null);

  useEffect(() => {
    if (rawTab === "profile" || rawTab === "broker" || rawTab === "billing") setTab(rawTab);
  }, [rawTab]);

  function showToast(msg: string, ok?: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Profile state ────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMe()
      .then(p => {
        setProfile(p);
        setFullName(p.full_name ?? "");
        setTelegramChatId(p.telegram_chat_id ?? "");
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      const updates: { full_name?: string; telegram_chat_id?: string } = {};
      if (fullName !== (profile?.full_name ?? "")) updates.full_name = fullName;
      if (telegramChatId !== (profile?.telegram_chat_id ?? ""))
        updates.telegram_chat_id = telegramChatId;
      if (Object.keys(updates).length === 0) {
        showToast("No changes to save", false);
        return;
      }
      const updated = await updateMe(updates);
      setProfile(updated);
      setFullName(updated.full_name ?? "");
      setTelegramChatId(updated.telegram_chat_id ?? "");
      showToast("Profile updated", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSaving(false);
    }
  }

  // ── Broker state ─────────────────────────────────────────────────────────
  const [brokerType, setBrokerType] = useState("");
  const [savingBroker, setSavingBroker] = useState(false);

  useEffect(() => {
    if (profile) {
      setBrokerType(profile.broker_type ?? "");
    }
  }, [profile]);

  async function saveBroker() {
    setSavingBroker(true);
    try {
      const updates: Parameters<typeof updateMe>[0] = {};
      if (brokerType) updates.broker_type = brokerType;
      if (Object.keys(updates).length === 0) { showToast("No changes to save", false); return; }
      const updated = await updateMe(updates);
      setProfile(updated);
      showToast("Broker preference saved", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSavingBroker(false);
    }
  }

  // ── Billing state ────────────────────────────────────────────────────────
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [billingCurrency, setBillingCurrency] = useState<Currency>("INR");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [referralCode, setReferralCode] = useState<string>("");
  const [accessCode, setAccessCode] = useState("");
  const [applyingAccess, setApplyingAccess] = useState(false);

  useEffect(() => {
    const c = profile?.billing_currency;
    if (c === "USD" || c === "INR") setBillingCurrency(c);
  }, [profile?.billing_currency]);

  useEffect(() => {
    if (tab !== "billing" || referralCode) return;
    getReferralCode().then(r => setReferralCode(r.referral_code)).catch(() => {});
  }, [tab, referralCode]);

  async function switchCurrency(next: Currency) {
    if (next === billingCurrency) return;
    setBillingCurrency(next);
    try {
      const updates: Parameters<typeof updateMe>[0] = { billing_currency: next };
      if (next === "USD" && (!profile?.billing_region || profile.billing_region === "IN")) {
        updates.billing_region = "NRI";
      }
      if (next === "INR" && profile?.billing_region && profile.billing_region !== "IN") {
        updates.billing_region = "IN";
      }
      const updated = await updateMe(updates);
      setProfile(updated);
    } catch { /* non-blocking */ }
  }

  const loadBilling = useCallback(async () => {
    const supabase = createClient();
    const [authData, planData, paymentData] = await Promise.all([
      supabase.auth.getUser().catch(() => ({ data: { user: null } })),
      getPlanStatus(),
      getPaymentConfig(),
    ]);
    const user = authData.data.user;
    setUserEmail(user?.email ?? "");
    setUserName(user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "");
    setPlanStatus(planData);
    setPaymentConfig(paymentData);
    setBillingLoading(false);
    setBillingLoaded(true);
  }, []);

  useEffect(() => {
    if (tab !== "billing" || billingLoaded) return;
    setBillingLoading(true);
    loadBilling();
  }, [tab, billingLoaded, loadBilling]);

  const handleUpgrade = async (planId: "pro" | "elite") => {
    if (paymentConfig && !paymentConfig.configured) { showToast("Payment gateway is not configured yet", false); return; }
    if (!RAZORPAY_KEY) { showToast("Billing is not enabled for this account", false); return; }
    setPaying(planId);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { showToast("Could not load payment gateway", false); setPaying(null); return; }
      const order = await createPaymentOrder(planId, billingCurrency, billingPeriod);
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: RAZORPAY_KEY,
          amount: order.amount,
          currency: order.currency,
          name: "AlphaVyuh",
          description: order.label,
          order_id: order.order_id,
          prefill: { name: userName, email: userEmail },
          theme: { color: planId === "pro" ? "#f4f7fb" : "#d97706" },
          handler: async (response: Record<string, string>) => {
            try {
              await verifyPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan: planId,
                currency: billingCurrency,
                billing: billingPeriod,
              });
              showToast(`${planId === "pro" ? "Pro" : "Elite"} plan activated!`, true);
              trackEvent("payment_verified", { plan: planId, currency: billingCurrency, billing: billingPeriod });
              await loadBilling();
              resolve();
            } catch { reject(new Error("Verification failed")); }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
        });
        rzp.open();
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "dismissed") showToast(`Payment failed: ${msg}`, false);
    } finally {
      setPaying(null);
    }
  };

  async function handleApplyAccess() {
    const code = accessCode.trim();
    if (!code) { showToast("Enter an access code", false); return; }
    setApplyingAccess(true);
    try {
      const result = await applyAccessPlan(code);
      showToast("Professional Access plan activated", true);
      trackEvent("professional_access_code_applied");
      setPlanStatus({ plan: result.plan, expires_at: result.expires_at, active: true });
      await loadBilling();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Access code failed", false);
    } finally {
      setApplyingAccess(false);
    }
  }

  const currentPlan = planStatus?.plan ?? "free";
  const checkoutEnabled = false;
  const expiresAt = planStatus?.expires_at
    ? new Date(planStatus.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "broker", label: "Broker" },
    { id: "billing", label: "Billing" },
  ];

  const cardStyle = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "20px",
    boxShadow: "var(--shadow-panel)",
  };

  return (
    <div className="min-h-full" style={{ background: "transparent", display: "flex", flexDirection: "column", gap: 16 }}>
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white shadow-lg z-50 pointer-events-none"
          style={{ background: toast.ok === false ? "#e5383b" : "#26a65b" }}>
          {toast.msg}
        </div>
      )}

      <div className="workspace-card" style={{ padding: "12px 14px" }}>
        <EyebrowLabel>Settings</EyebrowLabel>
        <div className="app-page-copy">
          Keep profile, broker import, and billing controls clear without changing the trading workflow.
        </div>
      </div>

      <div className="workspace-card" style={{ padding: "10px 12px" }}>
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-[13px] font-medium transition-colors rounded-full border"
              style={tab === t.id
                ? { borderColor: "rgba(244,247,251,0.16)", color: "var(--text-primary)", background: "rgba(255,255,255,0.05)" }
                : { borderColor: "transparent", color: "var(--text-tertiary)", background: "transparent" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Profile tab ────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="max-w-2xl">
          <div className="text-[14px] font-semibold mb-0.5" style={{ color: "var(--app-text1)" }}>Profile</div>
          <div className="text-[13px] mb-5" style={{ color: "var(--app-text3)" }}>Update your display name and connect Telegram for scan alert notifications.</div>

          {profileLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="animate-pulse h-20 rounded-[10px]" style={cardStyle} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Account card */}
              <div className="p-5" style={cardStyle}>
                <div className="text-[11px] uppercase tracking-wider mb-4" style={{ color: "var(--app-text3)" }}>Account</div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--app-text2)" }}>Email</label>
                    <div className="text-[13px] rounded-[8px] px-3 py-2.5" style={{ background: "var(--app-surface3)", color: "var(--app-text3)" }}>{profile?.email}</div>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--app-text2)" }}>Display name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Your name"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Telegram card */}
              <div className="p-5" style={cardStyle}>
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text3)" }}>Telegram Alerts</div>
                <div className="text-[12px] mb-4 leading-relaxed" style={{ color: "var(--app-text3)" }}>
                  Get notified on Telegram when your saved scan alerts trigger after market close.
                </div>
                <ol className="text-[12px] space-y-2 mb-4 list-decimal list-inside leading-relaxed" style={{ color: "var(--app-text2)" }}>
                  <li>Open Telegram and search for <code className="font-mono rounded px-1.5 py-0.5 text-[11px]" style={{ background: "var(--app-surface3)", color: "var(--app-text1)" }}>@userinfobot</code></li>
                  <li>Send it any message — it replies with your Chat ID (e.g. <span className="font-mono text-[11px]" style={{ color: "var(--app-text1)" }}>123456789</span>)</li>
                  <li>Paste that number below and save</li>
                </ol>
                <div>
                  <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--app-text2)" }}>Telegram Chat ID</label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={e => setTelegramChatId(e.target.value)}
                    placeholder="e.g. 123456789"
                    className={`${inputCls} font-mono`}
                    style={inputStyle}
                  />
                </div>
                {profile?.telegram_chat_id && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#26a65b]" />
                    <span className="text-[11px] font-medium" style={{ color: "#26a65b" }}>Connected</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="px-5 py-2.5 text-white text-[13px] font-medium rounded-[8px] transition-opacity disabled:opacity-50"
                  style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)", border: "1px solid rgba(244,247,251,0.24)" }}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ── Broker tab ─────────────────────────────────────────────────── */}
      {tab === "broker" && (
        <div className="max-w-2xl">
          <div className="text-[14px] font-semibold mb-0.5" style={{ color: "var(--app-text1)" }}>Broker connection</div>
          <div className="text-[13px] mb-5" style={{ color: "var(--app-text3)" }}>Choose your preferred broker here, then use the broker hub for secure OAuth connect, reconnect, and trade import.</div>

          {profileLoading ? (
            <div className="animate-pulse h-48 rounded-[10px]" style={cardStyle} />
          ) : (
            <div className="p-5" style={cardStyle}>
              {profile?.broker_type && profile.broker_type !== "none" && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#26a65b" }} />
                  <span className="text-[12px] font-medium capitalize" style={{ color: "#26a65b" }}>{profile.broker_type} configured</span>
                  {profile.broker_connected_at && (
                    <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>
                      · since {new Date(profile.broker_connected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--app-text2)" }}>Broker</label>
                  <select
                    value={brokerType}
                    onChange={e => setBrokerType(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                  >
                    <option value="">— Select broker —</option>
                    <option value="zerodha">Zerodha</option>
                    <option value="upstox">Upstox</option>
                    <option value="fyers">Fyers</option>
                    <option value="angel">Angel One</option>
                    <option value="other">Other (journal capture)</option>
                  </select>
                </div>

                {brokerType === "zerodha" && (
                  <div className="text-[12px] rounded-[8px] px-3 py-2.5 leading-relaxed" style={{ background: "var(--app-surface3)", color: "var(--app-text3)" }}>
                    Zerodha connects through AlphaVyuh&apos;s Kite app. You will sign in with Zerodha from the broker hub; AlphaVyuh never asks traders for developer API keys, API secrets, or broker passwords.
                  </div>
                )}

                {brokerType && brokerType !== "zerodha" && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px]" style={{ color: "var(--app-text3)" }}>
                      {brokerType === "upstox"
                        ? "Upstox connects through the broker hub OAuth flow where enabled."
                        : brokerType === "other"
                          ? "Orders stay as journal capture drafts."
                          : `${brokerType} adapter is planned after Zerodha and Upstox verification.`}
                    </p>
                  </div>
                )}

                {brokerType && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={saveBroker}
                      disabled={savingBroker}
                      className="flex-1 py-2.5 rounded-[8px] text-[13px] font-medium transition-opacity disabled:opacity-50"
                      style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                    >
                      {savingBroker ? "Saving..." : "Save preference"}
                    </button>
                    <Link
                      href="/settings/broker"
                      className="flex-1 py-2.5 rounded-[8px] text-[13px] font-semibold text-center"
                      style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)", border: "1px solid rgba(244,247,251,0.24)" }}
                    >
                      Open broker hub
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Billing tab ────────────────────────────────────────────────── */}
      {tab === "billing" && (
        <div className="max-w-[900px]">
          {billingLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#f4f7fb", borderTopColor: "transparent" }} />
            </div>
          ) : (
            <>
              {/* Current plan banner */}
              <div className="p-5 mb-6 flex items-center justify-between flex-wrap gap-4" style={cardStyle}>
                <div className="flex items-center gap-3">
                  {currentPlan === "free"  && <Zap size={18} style={{ color: "var(--app-text3)" }} />}
                  {currentPlan === "pro"   && <Sparkles size={18} style={{ color: "var(--accent)" }} />}
                  {currentPlan === "elite" && <Crown size={18} style={{ color: "var(--warn)" }} />}
                  <div>
                    <div className="text-[14px] font-semibold capitalize" style={{ color: "var(--app-text1)" }}>
                      {currentPlan} Plan
                      {currentPlan !== "free" && (
                        <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: currentPlan === "pro" ? "var(--accent-subtle)" : "var(--warn-subtle)",
                            color:      currentPlan === "pro" ? "var(--accent)" : "var(--warn)",
                          }}>
                          Active
                        </span>
                      )}
                    </div>
                    {expiresAt ? (
                      <div className="text-[12px] mt-0.5" style={{ color: "var(--app-text3)" }}>Renews {expiresAt}</div>
                    ) : currentPlan === "free" ? (
                      <div className="text-[12px] mt-0.5" style={{ color: "var(--app-text3)" }}>Upgrade to unlock all features</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>{userEmail}</div>
              </div>

              <div className="p-5 mb-6 flex items-start justify-between gap-4 flex-wrap" style={cardStyle}>
                <div className="flex items-start gap-3 max-w-[640px]">
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                    style={{ background: "var(--accent-subtle)", border: "1px solid rgba(244,247,251,0.16)" }}>
                    <Gift size={18} style={{ color: "var(--accent)" }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: "var(--accent)" }}>
                      Professional Access
                    </div>
                    <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>
                      Serious traders can request access pricing and onboarding help.
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--app-text3)" }}>
                      Apply an approved access code here. Checkout prices stay standard for everyone else.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
                    placeholder="ACCESS CODE"
                    aria-label="Professional Access code"
                    className="rounded-[8px] px-3 py-2.5 text-[13px] font-mono outline-none"
                    style={{ background: "rgba(244,247,251,0.06)", border: "1px solid rgba(244,247,251,0.14)", color: "var(--app-text1)", width: 140 }}
                  />
                  <button
                    onClick={handleApplyAccess}
                    disabled={applyingAccess}
                    className="inline-flex items-center gap-2 rounded-[8px] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-60"
                    style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }}
                  >
                    <Gift size={14} />
                    {applyingAccess ? "Applying..." : "Apply"}
                  </button>
                  <button
                    onClick={() => {
                      if (!accessCode.trim()) {
                        showToast("Enter an access code first", false);
                        return;
                      }
                      navigator.clipboard.writeText(accessCode);
                      showToast("Access code copied!", true);
                    }}
                    className="inline-flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-[13px] font-semibold"
                    style={{ background: "rgba(244,247,251,0.08)", border: "1px solid rgba(244,247,251,0.14)", color: "var(--app-text1)" }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              <div
                className="mb-5 rounded-[12px] px-4 py-3 text-[12px] flex items-start justify-between gap-3 flex-wrap"
                data-testid="billing-launch-posture"
                style={{
                  background: checkoutEnabled ? "rgba(38,166,91,0.08)" : "rgba(217,119,6,0.10)",
                  border: "1px solid var(--app-border)",
                  color: "var(--app-text2)",
                }}
              >
                <div className="max-w-[640px]">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-1" style={{ color: checkoutEnabled ? "var(--gain)" : "var(--warn)" }}>
                    Billing is not enabled for this account
                  </div>
                  <div className="leading-relaxed">
                    Checkout remains unavailable until account billing is approved and configured. Professional Access can still be applied with an approved access code.
                  </div>
                </div>
                <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(244,247,251,0.08)", color: "var(--app-text1)" }}>
                  Checkout blocked
                </div>
              </div>

              {paymentConfig && (
                <div className="mb-5 rounded-[12px] px-4 py-3 text-[12px] flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: paymentConfig.configured ? "rgba(38,166,91,0.08)" : "rgba(229,56,59,0.08)", border: "1px solid var(--app-border)", color: "var(--app-text2)" }}>
                  <span>
                    Razorpay mode: <strong style={{ color: "var(--app-text1)" }}>{paymentConfig.mode.toUpperCase()}</strong>
                    {paymentConfig.key_prefix ? ` · ${paymentConfig.key_prefix}...` : ""}
                  </span>
                  <span>{paymentConfig.configured ? "Checkout can open." : "Live payments are disabled until keys are configured."}</span>
                </div>
              )}

              {/* Currency + period toggles */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px]" style={{ color: "var(--app-text3)" }}>Currency:</span>
                  <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface2)" }}>
                    {(["INR", "USD"] as const).map(c => (
                      <button key={c} onClick={() => switchCurrency(c)}
                        className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
                        style={billingCurrency === c
                          ? { background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }
                          : { background: "transparent", color: "var(--app-text3)" }}>
                        {c === "INR" ? "₹ India" : "$ NRI / International"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px]" style={{ color: "var(--app-text3)" }}>Billing:</span>
                  <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface2)" }}>
                    {(["monthly", "annual"] as const).map(p => (
                      <button key={p} onClick={() => setBillingPeriod(p)}
                        className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
                        style={billingPeriod === p
                          ? { background: "var(--gain)", color: "#fff" }
                          : { background: "transparent", color: "var(--app-text3)" }}>
                        {p === "monthly" ? "Monthly" : "Annual (save 2 months)"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Plan cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {PLAN_META.map(plan => {
                  const isCurrent = currentPlan === plan.id;
                  const isHigher =
                    (currentPlan === "free" && plan.id !== "free") ||
                    (currentPlan === "pro" && plan.id === "elite");
                  const priceInfo = PLAN_PRICES[billingCurrency][billingPeriod][plan.id];
                  return (
                    <div key={plan.id} className="rounded-[14px] p-5 flex flex-col"
                      style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)",
                        border: isCurrent ? `2px solid ${plan.id === 'pro' ? 'var(--accent)' : plan.color}` : "1px solid rgba(255,255,255,0.08)",
                        boxShadow: "var(--shadow-panel)",
                      }}>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: plan.accentBg, color: plan.color }}>
                          {plan.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {priceInfo.savings && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(38,166,91,0.15)", color: "#26a65b" }}>
                              {priceInfo.savings}
                            </span>
                          )}
                          {isCurrent && <span className="text-[11px] font-medium" style={{ color: "var(--app-text3)" }}>Current</span>}
                        </div>
                      </div>
                      <div className="mb-4">
                        <span className="text-[28px] font-bold tracking-tight" style={{ color: "var(--app-text1)" }}>{priceInfo.price}</span>
                        {priceInfo.period && <span className="text-[13px]" style={{ color: "var(--app-text3)" }}>{priceInfo.period}</span>}
                      </div>
                      <ul className="flex-1 space-y-2 mb-5">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--app-text2)" }}>
                            <Check size={12} className="mt-0.5 shrink-0" style={{ color: plan.color }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {isCurrent ? (
                        <div className="w-full text-center py-2 rounded-[8px] text-[13px] font-medium"
                          style={{ background: plan.accentBg, color: plan.color }}>
                          Current plan
                        </div>
                      ) : isHigher ? (
                        <button
                          onClick={() => handleUpgrade(plan.id as "pro" | "elite")}
                          disabled={!!paying || !checkoutEnabled}
                          className="w-full py-2 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                          aria-disabled={!checkoutEnabled}
                          title={!checkoutEnabled ? "Billing is disabled until production checkout is approved and configured." : undefined}
                          style={{ background: checkoutEnabled ? plan.color : "rgba(244,247,251,0.10)", color: checkoutEnabled ? "#fff" : "var(--app-text3)" }}>
                          {paying === plan.id ? "Processing…" : checkoutEnabled ? `Upgrade to ${plan.label}` : "Checkout disabled"}
                        </button>
                      ) : (
                        <div className="w-full text-center py-2 rounded-[8px] text-[13px]"
                          style={{ background: "var(--app-surface3)", color: "var(--app-text3)" }}>
                          Downgrade available on expiry
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Referral code */}
              {referralCode && (
                <div className="mt-6 p-5 rounded-[12px]" style={cardStyle}>
                  <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Refer a friend</div>
                  <div className="text-[12px] mb-3" style={{ color: "var(--app-text3)" }}>
                    Share your referral code. When a friend subscribes, you both get 30 days added to your plan.
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-[14px] font-bold tracking-wider px-4 py-2.5 rounded-[8px]"
                      style={{ background: "rgba(139,150,166,0.12)", border: "1px solid rgba(139,150,166,0.25)", color: "#f4f7fb" }}>
                      {referralCode}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(referralCode);
                        showToast("Referral code copied!", true);
                      }}
                      className="px-4 py-2.5 rounded-[8px] text-[13px] font-medium text-white transition-opacity"
                      style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }}>
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 text-[12px] space-y-1" style={{ color: "var(--app-text3)" }}>
                <p>Payments processed by Razorpay. Secure, encrypted, and instant.</p>
                <p>Plans auto-expire after 30 days. Cancel anytime — no questions asked.</p>
                {!RAZORPAY_KEY && (
                  <p style={{ color: "#e5383b" }}>
                    Payments are in test mode. Add NEXT_PUBLIC_RAZORPAY_KEY_ID to enable live payments.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
