"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Zap, Sparkles, Crown } from "lucide-react";
import {
  getMe, updateMe, getZerodhaLoginUrl,
  listAlerts, updateAlert, deleteAlert, getAlertMatches,
  getPlanStatus, createPaymentOrder, verifyPayment, getReferralCode,
  type UserProfile, type ScanAlert, type ScanAlertMatch, type PlanStatus,
} from "@/lib/api";
import { createClient } from "@/lib/supabase";

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

// ── Alert helpers ─────────────────────────────────────────────────────────────

function filterSummary(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  if (filters.price_min != null || filters.price_max != null)
    parts.push(`Price ${filters.price_min ?? ""}–${filters.price_max ?? ""} ₹`);
  if (filters.pct_change_min != null) parts.push(`Change ≥ ${filters.pct_change_min}%`);
  if (filters.pct_change_max != null) parts.push(`Change ≤ ${filters.pct_change_max}%`);
  if (filters.volume_ratio_min != null) parts.push(`Vol ≥ ${filters.volume_ratio_min}×`);
  if (filters.rsi_min != null || filters.rsi_max != null)
    parts.push(`RSI ${filters.rsi_min ?? ""}–${filters.rsi_max ?? ""}`);
  if (filters.above_ema20 === true)  parts.push("Above EMA20");
  if (filters.above_ema50 === true)  parts.push("Above EMA50");
  if (filters.above_ema200 === true) parts.push("Above EMA200");
  if (filters.below_ema20 === true)  parts.push("Below EMA20");
  if (filters.below_ema50 === true)  parts.push("Below EMA50");
  if (filters.below_ema200 === true) parts.push("Below EMA200");
  if (filters.new_52w_high === true) parts.push("New 52W High");
  if (filters.new_52w_low === true)  parts.push("New 52W Low");
  if (filters.all_emas_bullish === true) parts.push("All EMAs Bullish");
  if (filters.sector) parts.push(`Sector: ${filters.sector}`);
  return parts.length ? parts.join(" · ") : "No filters";
}

function relativeDate(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ── Match drawer ──────────────────────────────────────────────────────────────

function MatchDrawer({ alert, onClose }: { alert: ScanAlert; onClose: () => void }) {
  const [matches, setMatches] = useState<ScanAlertMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ScanAlertMatch | null>(null);

  useEffect(() => {
    getAlertMatches(alert.id)
      .then(m => { setMatches(m); if (m.length) setSelected(m[0]); })
      .finally(() => setLoading(false));
  }, [alert.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[420px] h-full shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--app-surface)", borderLeft: "1px solid var(--app-border)" }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div>
            <div className="text-[14px] font-bold" style={{ color: "var(--app-text1)" }}>{alert.name}</div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text3)" }}>{filterSummary(alert.filters)}</div>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: "var(--app-text3)" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {!loading && matches.length > 0 && (
          <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
            {matches.map(m => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className="flex-shrink-0 text-[11px] font-medium px-3 py-1 rounded-full border transition-colors"
                style={selected?.id === m.id
                  ? { background: "#5b63f5", color: "#fff", borderColor: "#5b63f5" }
                  : { background: "transparent", color: "var(--app-text3)", borderColor: "var(--app-border)" }}
              >
                {m.run_date} <span className="ml-1 opacity-70">({m.match_count})</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[13px]" style={{ color: "var(--app-text3)" }}>Loading...</div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 px-6 text-center">
              <div className="text-[14px] font-medium" style={{ color: "var(--app-text2)" }}>No results yet</div>
              <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>
                This alert runs automatically after daily market data is ingested (around 4:30 PM IST).
              </div>
            </div>
          ) : selected ? (
            <div style={{ borderTop: "1px solid var(--app-border2)" }}>
              {selected.symbols.length === 0 ? (
                <div className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--app-text3)" }}>
                  No stocks matched on {selected.run_date}
                </div>
              ) : selected.symbols.map(s => (
                <Link
                  key={s.symbol}
                  href={`/charts/${s.symbol}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors"
                  style={{ borderBottom: "1px solid var(--app-border2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <div className="text-[13px] font-semibold" style={{ color: "var(--app-text1)" }}>{s.symbol}</div>
                  <div className="flex items-center gap-3 text-right">
                    {s.volume_ratio != null && (
                      <span className="text-[11px] font-medium" style={{ color: "#5b63f5" }}>{s.volume_ratio}×</span>
                    )}
                    {s.rsi_14 != null && (
                      <span className="text-[11px]" style={{ color: "var(--app-text3)" }}>RSI {s.rsi_14.toFixed(0)}</span>
                    )}
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: "var(--app-text1)" }}>
                        ₹{s.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {s.pct_change != null && (
                        <div className="text-[11px] font-medium" style={{ color: s.pct_change >= 0 ? "#26a65b" : "#e5383b" }}>
                          {s.pct_change >= 0 ? "+" : ""}{s.pct_change.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
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
    id: "pro", label: "Pro", color: "#5b63f5", accentBg: "rgba(91,99,245,0.12)",
    features: [
      "Scanner — 500 results, unlimited",
      "Unlimited saved screens",
      "Unlimited watchlists",
      "All chart indicators (BB, VWAP, MACD…)",
      "Full journal + AI mistake analysis",
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

type Tab = "profile" | "alerts" | "billing";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "profile";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [toast, setToast] = useState<{ msg: string; ok?: boolean } | null>(null);

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
  const [brokerApiKey, setBrokerApiKey] = useState("");
  const [brokerApiSecret, setBrokerApiSecret] = useState("");
  const [savingBroker, setSavingBroker] = useState(false);
  const [connectingZerodha, setConnectingZerodha] = useState(false);

  useEffect(() => {
    if (profile) {
      setBrokerType(profile.broker_type ?? "");
      setBrokerApiKey("");
      setBrokerApiSecret("");
    }
  }, [profile]);

  async function saveBroker() {
    setSavingBroker(true);
    try {
      const updates: Parameters<typeof updateMe>[0] = {};
      if (brokerType) updates.broker_type = brokerType;
      if (brokerApiKey.trim()) updates.broker_api_key = brokerApiKey.trim();
      if (brokerApiSecret.trim()) updates.broker_api_secret = brokerApiSecret.trim();
      if (Object.keys(updates).length === 0) { showToast("No changes to save", false); return; }
      const updated = await updateMe(updates);
      setProfile(updated);
      setBrokerApiKey(""); setBrokerApiSecret("");
      showToast("Broker settings saved", true);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSavingBroker(false);
    }
  }

  async function handleZerodhaConnect() {
    setConnectingZerodha(true);
    try {
      const url = await getZerodhaLoginUrl();
      window.open(url, "_blank");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Could not start Zerodha login", false);
    } finally {
      setConnectingZerodha(false);
    }
  }

  // ── Alerts state ─────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<ScanAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsError, setAlertsError] = useState("");
  const [drawerAlert, setDrawerAlert] = useState<ScanAlert | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "alerts" || alertsLoaded) return;
    setAlertsLoading(true);
    listAlerts()
      .then(setAlerts)
      .catch(e => setAlertsError(e.message))
      .finally(() => { setAlertsLoading(false); setAlertsLoaded(true); });
  }, [tab, alertsLoaded]);

  async function handleToggle(alert: ScanAlert) {
    setToggling(alert.id);
    try {
      const updated = await updateAlert(alert.id, { is_active: !alert.is_active });
      setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch {
      showToast("Failed to update alert");
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(alert: ScanAlert) {
    if (!confirm(`Delete alert "${alert.name}"?`)) return;
    setDeleting(alert.id);
    try {
      await deleteAlert(alert.id);
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
      showToast("Alert deleted");
    } catch {
      showToast("Failed to delete alert");
    } finally {
      setDeleting(null);
    }
  }

  // ── Billing state ────────────────────────────────────────────────────────
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [billingCurrency, setBillingCurrency] = useState<Currency>("INR");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [referralCode, setReferralCode] = useState<string>("");

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
    const [{ data: { user } }, planData] = await Promise.all([
      supabase.auth.getUser(),
      getPlanStatus(),
    ]);
    setUserEmail(user?.email ?? "");
    setUserName(user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "");
    setPlanStatus(planData);
    setBillingLoading(false);
    setBillingLoaded(true);
  }, []);

  useEffect(() => {
    if (tab !== "billing" || billingLoaded) return;
    setBillingLoading(true);
    loadBilling();
  }, [tab, billingLoaded, loadBilling]);

  const handleUpgrade = async (planId: "pro" | "elite") => {
    if (!RAZORPAY_KEY) { showToast("Payments not configured yet — coming soon!", false); return; }
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
          theme: { color: planId === "pro" ? "#5b63f5" : "#d97706" },
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

  const currentPlan = planStatus?.plan ?? "free";
  const expiresAt = planStatus?.expires_at
    ? new Date(planStatus.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "alerts", label: "Alerts" },
    { id: "billing", label: "Billing" },
  ];

  const cardStyle = { background: "var(--app-surface2)", border: "1px solid var(--app-border)", borderRadius: "10px" };

  return (
    <div className="min-h-full" style={{ background: "var(--app-bg)" }}>
      {drawerAlert && <MatchDrawer alert={drawerAlert} onClose={() => setDrawerAlert(null)} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white shadow-lg z-50 pointer-events-none"
          style={{ background: toast.ok === false ? "#e5383b" : "#26a65b" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="px-5 pt-5 pb-0" style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
        <div className="text-[20px] font-semibold tracking-tight mb-3" style={{ color: "var(--app-text1)" }}>Settings</div>
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors"
              style={tab === t.id
                ? { borderColor: "#5b63f5", color: "#5b63f5" }
                : { borderColor: "transparent", color: "var(--app-text3)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Profile tab ────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="max-w-2xl px-5 py-6">
          <div className="text-[14px] font-semibold mb-0.5" style={{ color: "var(--app-text1)" }}>Profile &amp; Notifications</div>
          <div className="text-[13px] mb-5" style={{ color: "var(--app-text3)" }}>Update your display name and connect Telegram for scan alerts.</div>

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
                  style={{ background: "#5b63f5" }}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>

              {/* Broker card */}
              <div className="p-5" style={cardStyle}>
                <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text3)" }}>Broker Connection</div>
                <div className="text-[12px] mb-4 leading-relaxed" style={{ color: "var(--app-text3)" }}>
                  Connect your broker to route orders directly from charts. Orders placed on AlphaVyuh will execute via your broker account.
                </div>

                {profile?.broker_type && profile.broker_type !== "none" && (
                  <div className="flex items-center gap-2 mb-3">
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
                      <option value="other">Other (simulated)</option>
                    </select>
                  </div>

                  {brokerType === "zerodha" && (
                    <>
                      <div className="text-[11px] rounded-[8px] px-3 py-2.5 leading-relaxed" style={{ background: "var(--app-surface3)", color: "var(--app-text3)" }}>
                        Get your API key &amp; secret from{" "}
                        <span className="font-medium" style={{ color: "#5b63f5" }}>developers.kite.trade</span>.
                        Set the redirect URL to{" "}
                        <code className="font-mono text-[10px] px-1 rounded" style={{ background: "var(--app-surface2)", color: "var(--app-text2)", border: "1px solid var(--app-border)" }}>
                          {typeof window !== "undefined" ? `${window.location.origin}/broker/callback` : "/broker/callback"}
                        </code>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--app-text2)" }}>API Key</label>
                        <input
                          type="text"
                          value={brokerApiKey}
                          onChange={e => setBrokerApiKey(e.target.value)}
                          placeholder={profile?.broker_api_key ? `Current: ${profile.broker_api_key}` : "kitexxxxxxxxxxx"}
                          className={`${inputCls} font-mono`}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium block mb-1.5" style={{ color: "var(--app-text2)" }}>API Secret</label>
                        <input
                          type="password"
                          value={brokerApiSecret}
                          onChange={e => setBrokerApiSecret(e.target.value)}
                          placeholder="Enter new secret to update"
                          className={inputCls}
                          style={inputStyle}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveBroker}
                          disabled={savingBroker}
                          className="flex-1 py-2.5 rounded-[8px] text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
                          style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" }}
                        >
                          {savingBroker ? "Saving..." : "Save API credentials"}
                        </button>
                        {profile?.broker_api_key && (
                          <button
                            onClick={handleZerodhaConnect}
                            disabled={connectingZerodha}
                            className="flex-1 py-2.5 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
                            style={{ background: "#5b63f5" }}
                          >
                            {connectingZerodha ? "Opening..." : "Connect Zerodha →"}
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {brokerType && brokerType !== "zerodha" && (
                    <div className="flex items-center justify-between">
                      <p className="text-[12px]" style={{ color: "var(--app-text3)" }}>
                        {brokerType === "other" ? "Orders will be simulated." : `${brokerType} integration coming soon.`}
                      </p>
                      <button
                        onClick={saveBroker}
                        disabled={savingBroker}
                        className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
                        style={{ background: "#5b63f5" }}
                      >
                        {savingBroker ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts tab ─────────────────────────────────────────────────── */}
      {tab === "alerts" && (
        <div className="px-5 py-5">
          <div className="text-[14px] font-semibold mb-0.5" style={{ color: "var(--app-text1)" }}>Scan Alerts</div>
          <div className="text-[13px] mb-4" style={{ color: "var(--app-text3)" }}>Saved scans that run automatically after market close each trading day.</div>

          <div className="mb-4 max-w-2xl rounded-[10px] px-4 py-3"
            style={{ background: "rgba(91,99,245,0.1)", border: "1px solid rgba(91,99,245,0.25)" }}>
            <div className="text-[12px] font-semibold mb-0.5" style={{ color: "#5b63f5" }}>How to create an alert</div>
            <div className="text-[12px] leading-relaxed" style={{ color: "var(--app-text2)" }}>
              Go to the{" "}
              <Link href="/scanner" className="underline font-medium" style={{ color: "#5b63f5" }}>Scanner</Link>
              , build your filter conditions, then click{" "}
              <span className="font-medium">&quot;Save as Alert&quot;</span>{" "}
              in the toolbar. Results will appear here after market close.
            </div>
          </div>

          {alertsLoading ? (
            <div className="space-y-3 max-w-2xl">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-20 rounded-[10px]" style={cardStyle} />
              ))}
            </div>
          ) : alertsError ? (
            <div className="text-[13px]" style={{ color: "#e5383b" }}>{alertsError}</div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(91,99,245,0.1)" }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3v3M11 16v3M3 11h3M16 11h3" stroke="#5b63f5" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="11" cy="11" r="4" stroke="#5b63f5" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="text-[14px] font-medium" style={{ color: "var(--app-text2)" }}>No alerts yet</div>
              <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>Create one from the Scanner page</div>
              <Link href="/scanner" className="mt-1 text-[13px] font-medium px-4 py-1.5 rounded-full"
                style={{ color: "#5b63f5", background: "rgba(91,99,245,0.1)" }}>
                Go to Scanner
              </Link>
            </div>
          ) : (
            <div className="max-w-2xl space-y-2.5">
              {alerts.map(alert => (
                <div key={alert.id} className="rounded-[10px] px-4 py-3.5" style={{ ...cardStyle, opacity: alert.is_active ? 1 : 0.55 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold truncate" style={{ color: "var(--app-text1)" }}>{alert.name}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={alert.is_active
                            ? { background: "rgba(38,166,91,0.15)", color: "#26a65b" }
                            : { background: "var(--app-surface3)", color: "var(--app-text3)" }}>
                          {alert.is_active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--app-text3)" }}>{filterSummary(alert.filters)}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(alert)}
                        disabled={toggling === alert.id}
                        title={alert.is_active ? "Pause alert" : "Resume alert"}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                        style={{ color: "var(--app-text3)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--app-surface3)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                      >
                        {alert.is_active ? (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <rect x="2" y="2" width="3.5" height="9" rx="1" fill="currentColor" />
                            <rect x="7.5" y="2" width="3.5" height="9" rx="1" fill="currentColor" />
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M3 2l8 4.5L3 11V2z" fill="currentColor" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(alert)}
                        disabled={deleting === alert.id}
                        title="Delete alert"
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                        style={{ color: "var(--app-text3)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e5383b"; (e.currentTarget as HTMLElement).style.background = "rgba(229,56,59,0.1)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--app-text3)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3.5l-.7 7a.5.5 0 01-.5.5H3.7a.5.5 0 01-.5-.5l-.7-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: "1px solid var(--app-border2)" }}>
                    <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--app-text3)" }}>
                      <span>Last run: {relativeDate(alert.last_run_at)}</span>
                      {alert.last_match_count != null && (
                        <span>
                          <span className="font-semibold" style={{ color: alert.last_match_count > 0 ? "#5b63f5" : "var(--app-text3)" }}>
                            {alert.last_match_count}
                          </span>{" "}
                          match{alert.last_match_count !== 1 ? "es" : ""}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setDrawerAlert(alert)} className="text-[11px] font-medium hover:underline" style={{ color: "#5b63f5" }}>
                      View results →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Billing tab ────────────────────────────────────────────────── */}
      {tab === "billing" && (
        <div className="px-5 py-6 max-w-[900px]">
          {billingLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#5b63f5", borderTopColor: "transparent" }} />
            </div>
          ) : (
            <>
              {/* Current plan banner */}
              <div className="p-5 mb-6 flex items-center justify-between flex-wrap gap-4 rounded-[12px]" style={cardStyle}>
                <div className="flex items-center gap-3">
                  {currentPlan === "free"  && <Zap size={18} style={{ color: "var(--app-text3)" }} />}
                  {currentPlan === "pro"   && <Sparkles size={18} style={{ color: "#5b63f5" }} />}
                  {currentPlan === "elite" && <Crown size={18} style={{ color: "#d97706" }} />}
                  <div>
                    <div className="text-[14px] font-semibold capitalize" style={{ color: "var(--app-text1)" }}>
                      {currentPlan} Plan
                      {currentPlan !== "free" && (
                        <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: currentPlan === "pro" ? "rgba(91,99,245,0.15)" : "rgba(217,119,6,0.15)",
                            color:      currentPlan === "pro" ? "#5b63f5" : "#d97706",
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

              {/* Currency + period toggles */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px]" style={{ color: "var(--app-text3)" }}>Currency:</span>
                  <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface2)" }}>
                    {(["INR", "USD"] as const).map(c => (
                      <button key={c} onClick={() => switchCurrency(c)}
                        className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
                        style={billingCurrency === c
                          ? { background: "#5b63f5", color: "#fff" }
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
                          ? { background: "#26a65b", color: "#fff" }
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
                        background: "var(--app-surface2)",
                        border: isCurrent ? `2px solid ${plan.color}` : "1px solid var(--app-border)",
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
                          disabled={!!paying}
                          className="w-full py-2 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                          style={{ background: plan.color }}>
                          {paying === plan.id ? "Processing…" : `Upgrade to ${plan.label}`}
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
                      style={{ background: "rgba(91,99,245,0.12)", border: "1px solid rgba(91,99,245,0.25)", color: "#5b63f5" }}>
                      {referralCode}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(referralCode);
                        showToast("Referral code copied!", true);
                      }}
                      className="px-4 py-2.5 rounded-[8px] text-[13px] font-medium text-white transition-opacity"
                      style={{ background: "#5b63f5" }}>
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
