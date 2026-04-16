"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Zap, Sparkles, Crown } from "lucide-react";
import {
  getMe, updateMe, getZerodhaLoginUrl,
  listAlerts, updateAlert, deleteAlert, getAlertMatches,
  getPlanStatus, createPaymentOrder, verifyPayment,
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
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[420px] bg-white h-full shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0ee]">
          <div>
            <div className="text-[14px] font-bold text-[#1c1c1a]">{alert.name}</div>
            <div className="text-[11px] text-[#aaa] mt-0.5">{filterSummary(alert.filters)}</div>
          </div>
          <button onClick={onClose} className="text-[#aaa] hover:text-[#555] p-1">
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
                  : { background: "transparent", color: "#888", borderColor: "#e2e2df" }}
              >
                {m.run_date} <span className="ml-1 opacity-70">({m.match_count})</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[13px] text-[#aaa]">Loading...</div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 px-6 text-center">
              <div className="text-[14px] font-medium text-[#555]">No results yet</div>
              <div className="text-[12px] text-[#aaa]">
                This alert runs automatically after daily market data is ingested (around 4:30 PM IST).
              </div>
            </div>
          ) : selected ? (
            <div className="divide-y divide-[#f7f7f5]">
              {selected.symbols.length === 0 ? (
                <div className="px-5 py-8 text-center text-[13px] text-[#aaa]">
                  No stocks matched on {selected.run_date}
                </div>
              ) : selected.symbols.map(s => (
                <Link
                  key={s.symbol}
                  href={`/charts/${s.symbol}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#fafafa] transition-colors"
                >
                  <div className="text-[13px] font-semibold text-[#1c1c1a]">{s.symbol}</div>
                  <div className="flex items-center gap-3 text-right">
                    {s.volume_ratio != null && (
                      <span className="text-[11px] text-[#5b63f5] font-medium">{s.volume_ratio}×</span>
                    )}
                    {s.rsi_14 != null && (
                      <span className="text-[11px] text-[#888]">RSI {s.rsi_14.toFixed(0)}</span>
                    )}
                    <div>
                      <div className="text-[13px] font-semibold text-[#1c1c1a]">
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
  },
];

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
      setBrokerApiKey(""); // never pre-fill secret fields
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

  return (
    <div className="min-h-full bg-[#f2f2f0]">
      {/* Match drawer */}
      {drawerAlert && <MatchDrawer alert={drawerAlert} onClose={() => setDrawerAlert(null)} />}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white shadow-lg z-50 pointer-events-none"
          style={{ background: toast.ok === false ? "#e5383b" : "#26a65b" }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-[#e2e2df] px-5 pt-5 pb-0">
        <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight mb-3">Settings</div>
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#5b63f5] text-[#5b63f5]"
                  : "border-transparent text-[#888] hover:text-[#1c1c1a]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Profile tab ────────────────────────────────────────────────── */}
      {tab === "profile" && (
        <div className="max-w-2xl px-5 py-6">
          <div className="text-[14px] font-semibold text-[#1c1c1a] mb-0.5">Profile &amp; Notifications</div>
          <div className="text-[13px] text-[#888] mb-5">Update your display name and connect Telegram for scan alerts.</div>

          {profileLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="bg-white border border-[#e2e2df] rounded-[10px] p-5 animate-pulse h-20" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-[#e2e2df] rounded-[10px] p-5">
                <div className="text-[11px] text-[#aaa] uppercase tracking-wider mb-4">Account</div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[12px] font-medium text-[#555] block mb-1.5">Email</label>
                    <div className="text-[13px] text-[#888] bg-[#f7f7f5] rounded-lg px-3 py-2.5">{profile?.email}</div>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-[#555] block mb-1.5">Display name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Your name"
                      className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#e2e2df] rounded-[10px] p-5">
                <div className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1">Telegram Alerts</div>
                <div className="text-[12px] text-[#888] mb-4 leading-relaxed">
                  Get notified on Telegram when your saved scan alerts trigger after market close.
                </div>
                <ol className="text-[12px] text-[#666] space-y-2 mb-4 list-decimal list-inside leading-relaxed">
                  <li>Open Telegram and search for <span className="font-mono bg-[#f0f0ee] px-1.5 py-0.5 rounded text-[11px]">@userinfobot</span></li>
                  <li>Send it any message — it replies with your Chat ID (e.g. <span className="font-mono text-[11px]">123456789</span>)</li>
                  <li>Paste that number below and save</li>
                </ol>
                <div>
                  <label className="text-[12px] font-medium text-[#555] block mb-1.5">Telegram Chat ID</label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={e => setTelegramChatId(e.target.value)}
                    placeholder="e.g. 123456789"
                    className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] transition-colors font-mono"
                  />
                </div>
                {profile?.telegram_chat_id && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#26a65b]" />
                    <span className="text-[11px] text-[#26a65b] font-medium">Connected</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#1c1c1a] text-white text-[13px] font-medium rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>

              {/* Broker connection */}
              <div className="bg-white border border-[#e2e2df] rounded-[10px] p-5 mt-1">
                <div className="text-[11px] text-[#aaa] uppercase tracking-wider mb-1">Broker Connection</div>
                <div className="text-[12px] text-[#888] mb-4 leading-relaxed">
                  Connect your broker to route orders directly from charts. Orders placed on AlphaVyuh will execute via your broker account.
                </div>

                {profile?.broker_type && profile.broker_type !== "none" && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#26a65b]" />
                    <span className="text-[12px] text-[#26a65b] font-medium capitalize">{profile.broker_type} configured</span>
                    {profile.broker_connected_at && (
                      <span className="text-[11px] text-[#aaa]">
                        · since {new Date(profile.broker_connected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] font-medium text-[#555] block mb-1.5">Broker</label>
                    <select
                      value={brokerType}
                      onChange={e => setBrokerType(e.target.value)}
                      className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] transition-colors"
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
                      <div className="text-[11px] text-[#888] bg-[#f7f7f5] rounded-lg px-3 py-2.5 leading-relaxed">
                        Get your API key &amp; secret from{" "}
                        <span className="text-[#5b63f5] font-medium">developers.kite.trade</span>.
                        Set the redirect URL to{" "}
                        <code className="bg-white border border-[#e2e2df] px-1 rounded text-[10px]">http://localhost:3000/broker/callback</code>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#555] block mb-1.5">API Key</label>
                        <input
                          type="text"
                          value={brokerApiKey}
                          onChange={e => setBrokerApiKey(e.target.value)}
                          placeholder={profile?.broker_api_key ? `Current: ${profile.broker_api_key}` : "kitexxxxxxxxxxx"}
                          className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] font-mono transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-[#555] block mb-1.5">API Secret</label>
                        <input
                          type="password"
                          value={brokerApiSecret}
                          onChange={e => setBrokerApiSecret(e.target.value)}
                          placeholder="Enter new secret to update"
                          className="w-full text-[13px] bg-[#f7f7f5] border border-[#e2e2df] rounded-lg px-3 py-2.5 outline-none focus:border-[#5b63f5] transition-colors"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveBroker}
                          disabled={savingBroker}
                          className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-white bg-[#1c1c1a] hover:bg-[#333] transition-colors disabled:opacity-50"
                        >
                          {savingBroker ? "Saving..." : "Save API credentials"}
                        </button>
                        {profile?.broker_api_key && (
                          <button
                            onClick={handleZerodhaConnect}
                            disabled={connectingZerodha}
                            className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
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
                      <p className="text-[12px] text-[#888]">
                        {brokerType === "other" ? "Orders will be simulated." : `${brokerType} integration coming soon.`}
                      </p>
                      <button
                        onClick={saveBroker}
                        disabled={savingBroker}
                        className="px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[#1c1c1a] hover:bg-[#333] transition-colors disabled:opacity-50"
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
          <div className="text-[14px] font-semibold text-[#1c1c1a] mb-0.5">Scan Alerts</div>
          <div className="text-[13px] text-[#888] mb-4">Saved scans that run automatically after market close each trading day.</div>

          <div className="mb-4 bg-[#eeeffe] border border-[#d0d3fb] rounded-[10px] px-4 py-3 max-w-2xl">
            <div className="text-[12px] font-semibold text-[#5b63f5] mb-0.5">How to create an alert</div>
            <div className="text-[12px] text-[#555] leading-relaxed">
              Go to the{" "}
              <Link href="/scanner" className="underline font-medium text-[#5b63f5]">Scanner</Link>
              , build your filter conditions, then click{" "}
              <span className="font-medium">&quot;Save as Alert&quot;</span>{" "}
              in the toolbar. Results will appear here after market close.
            </div>
          </div>

          {alertsLoading ? (
            <div className="space-y-3 max-w-2xl">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-4 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-40 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-64" />
                </div>
              ))}
            </div>
          ) : alertsError ? (
            <div className="text-[13px] text-red-400">{alertsError}</div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-[#eeeffe] flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M11 3v3M11 16v3M3 11h3M16 11h3" stroke="#5b63f5" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="11" cy="11" r="4" stroke="#5b63f5" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="text-[14px] font-medium text-[#555]">No alerts yet</div>
              <div className="text-[12px] text-[#aaa]">Create one from the Scanner page</div>
              <Link href="/scanner" className="mt-1 text-[13px] font-medium text-[#5b63f5] bg-[#eeeffe] px-4 py-1.5 rounded-full">
                Go to Scanner
              </Link>
            </div>
          ) : (
            <div className="max-w-2xl space-y-2.5">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3.5"
                  style={!alert.is_active ? { opacity: 0.55 } : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#1c1c1a] truncate">{alert.name}</span>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={alert.is_active
                            ? { background: "#edfaf3", color: "#26a65b" }
                            : { background: "#f5f5f3", color: "#aaa" }}
                        >
                          {alert.is_active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#aaa] mt-0.5 truncate">{filterSummary(alert.filters)}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(alert)}
                        disabled={toggling === alert.id}
                        title={alert.is_active ? "Pause alert" : "Resume alert"}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#aaa] hover:text-[#555] hover:bg-[#f5f5f3] transition-colors"
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
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#aaa] hover:text-[#e5383b] hover:bg-[#fef2f2] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3.5l-.7 7a.5.5 0 01-.5.5H3.7a.5.5 0 01-.5-.5l-.7-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#f7f7f5]">
                    <div className="flex items-center gap-3 text-[11px] text-[#aaa]">
                      <span>Last run: {relativeDate(alert.last_run_at)}</span>
                      {alert.last_match_count != null && (
                        <span>
                          <span className="font-semibold" style={{ color: alert.last_match_count > 0 ? "#5b63f5" : "#aaa" }}>
                            {alert.last_match_count}
                          </span>{" "}
                          match{alert.last_match_count !== 1 ? "es" : ""}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setDrawerAlert(alert)} className="text-[11px] font-medium text-[#5b63f5] hover:underline">
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
              <div className="w-5 h-5 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin" />
            </div>
          ) : (
            <>
              {/* Current plan banner */}
              <div className="bg-white border border-[#e2e2df] rounded-[12px] p-5 mb-6 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  {currentPlan === "free"  && <Zap size={18} className="text-[#888]" />}
                  {currentPlan === "pro"   && <Sparkles size={18} className="text-[#5b63f5]" />}
                  {currentPlan === "elite" && <Crown size={18} className="text-[#d97706]" />}
                  <div>
                    <div className="text-[14px] font-semibold text-[#1c1c1a] capitalize">
                      {currentPlan} Plan
                      {currentPlan !== "free" && (
                        <span
                          className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: currentPlan === "pro" ? "#eeeffe" : "#fff8ec",
                            color:      currentPlan === "pro" ? "#5b63f5" : "#d97706",
                          }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    {expiresAt ? (
                      <div className="text-[12px] text-[#aaa] mt-0.5">Renews {expiresAt}</div>
                    ) : currentPlan === "free" ? (
                      <div className="text-[12px] text-[#aaa] mt-0.5">Upgrade to unlock all features</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-[12px] text-[#888]">{userEmail}</div>
              </div>

              {/* Plan cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {PLANS.map(plan => {
                  const isCurrent = currentPlan === plan.id;
                  const isHigher =
                    (currentPlan === "free" && plan.id !== "free") ||
                    (currentPlan === "pro" && plan.id === "elite");
                  return (
                    <div
                      key={plan.id}
                      className="bg-white border rounded-[14px] p-5 flex flex-col"
                      style={{ borderColor: isCurrent ? plan.color : "#e2e2df", borderWidth: isCurrent ? 2 : 1 }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span
                          className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: plan.bg, color: plan.color }}
                        >
                          {plan.label}
                        </span>
                        {isCurrent && <span className="text-[11px] text-[#888] font-medium">Current</span>}
                      </div>
                      <div className="mb-4">
                        <span className="text-[28px] font-bold tracking-tight text-[#1c1c1a]">{plan.price}</span>
                        {plan.period && <span className="text-[13px] text-[#aaa]">{plan.period}</span>}
                      </div>
                      <ul className="flex-1 space-y-2 mb-5">
                        {plan.features.map(f => (
                          <li key={f} className="flex items-start gap-2 text-[12px] text-[#555]">
                            <Check size={12} className="mt-0.5 shrink-0" style={{ color: plan.color }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {isCurrent ? (
                        <div className="w-full text-center py-2 rounded-[8px] text-[13px] font-medium" style={{ background: plan.bg, color: plan.color }}>
                          Current plan
                        </div>
                      ) : isHigher ? (
                        <button
                          onClick={() => handleUpgrade(plan.id as "pro" | "elite")}
                          disabled={!!paying}
                          className="w-full py-2 rounded-[8px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
                          style={{ background: plan.color }}
                        >
                          {paying === plan.id ? "Processing…" : `Upgrade to ${plan.label}`}
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

              <div className="mt-6 text-[12px] text-[#aaa] space-y-1">
                <p>Payments processed by Razorpay. Secure, encrypted, and instant.</p>
                <p>Plans auto-expire after 30 days. Cancel anytime — no questions asked.</p>
                {!RAZORPAY_KEY && (
                  <p className="text-[#e5383b]">
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
