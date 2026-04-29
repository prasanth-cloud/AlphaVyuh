"use client";

import { useState } from "react";
import { addToWatchlist, createWatchlist, updateMe } from "@/lib/api";

const STEPS = ["About you", "Capture", "Get started"];

type FormState = {
  experience: string;
  trades: string;
  broker: string;
  broker_api_key: string;
  broker_api_secret: string;
  first_value: string;
};

const BROKERS = [
  { value: "zerodha",  label: "Zerodha",   logo: "Z" },
  { value: "upstox",   label: "Upstox",    logo: "U" },
  { value: "fyers",    label: "Fyers",     logo: "F" },
  { value: "angel",    label: "Angel One", logo: "A" },
  { value: "other",    label: "Other",     logo: "?" },
  { value: "none",     label: "None yet",  logo: "–" },
];
const STARTER_SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "TATAMOTORS"];

const cardStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), var(--surface-1)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "24px",
  boxShadow: "var(--shadow-panel)",
};
const inputStyle = { background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), var(--surface-2)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" };

function Radio({
  name,
  value,
  label,
  checked,
  onSelect,
}: {
  name: keyof FormState;
  value: string;
  label: string;
  checked: boolean;
  onSelect: (name: keyof FormState, value: string) => void;
}) {
  return (
    <label
      className="flex items-center gap-3 p-3 rounded-[8px] border cursor-pointer transition-colors"
      style={checked
        ? { border: "1px solid var(--accent)", background: "var(--accent-subtle)" }
        : { border: "1px solid rgba(255,255,255,0.08)", background: "transparent" }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(name, value)}
        className="accent-[var(--accent)]"
      />
      <span className="text-[14px]" style={{ color: "var(--text-primary)" }}>{label}</span>
    </label>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    experience: "", trades: "", broker: "", broker_api_key: "", broker_api_secret: "", first_value: "journal",
  });

  const selectRadio = (name: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function finish(destination = "/dashboard", seedStarterQueue = false) {
    setLoading(true);
    setError("");
    try {
      const updates: Parameters<typeof updateMe>[0] & {
        broker_type?: string;
        broker_api_key?: string;
        broker_api_secret?: string;
      } = { onboarding_completed: true };

      if (form.broker && form.broker !== "none") {
        updates.broker_type = form.broker;
        if (form.broker_api_key.trim()) updates.broker_api_key = form.broker_api_key.trim();
        if (form.broker_api_secret.trim()) updates.broker_api_secret = form.broker_api_secret.trim();
      }

      await updateMe(updates as Parameters<typeof updateMe>[0]);
      if (seedStarterQueue) {
        const starter = await createWatchlist("Starter setup queue").catch(() => null);
        if (starter?.id) {
          await Promise.all(STARTER_SYMBOLS.map((symbol) => addToWatchlist(starter.id, symbol).catch(() => null)));
        }
      }
      window.location.replace(destination);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  const zerodhaSelected = form.broker === "zerodha";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "transparent" }}>
      <div className="w-full max-w-3xl">
        <div style={{
          padding: "22px 24px",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "radial-gradient(circle at top right, rgba(244,247,251,0.12), transparent 28%), linear-gradient(180deg, rgba(13,22,26,0.94), rgba(10,14,18,0.96))",
          boxShadow: "var(--shadow-panel)",
          marginBottom: 16,
        }}>
          <div className="label" style={{ color: "var(--accent)", marginBottom: 10 }}>Onboarding</div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02, letterSpacing: "-0.04em", marginBottom: 8 }}>Get to your first trading insight quickly.</h1>
          <p style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
            Tell AlphaVyuh how you trade, choose your fastest starting point, and begin with one captured trade or setup queue.
          </p>
        </div>
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                style={i <= step
                  ? { background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#061110" }
                  : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className="text-[13px]"
                style={{ color: i === step ? "var(--text-primary)" : "var(--text-tertiary)", fontWeight: i === step ? 600 : 400 }}>
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px" style={{ background: i < step ? "var(--accent)" : "rgba(255,255,255,0.08)" }} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — About you */}
        {step === 0 && (
          <div className="p-6" style={cardStyle}>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>Tell us about yourself</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>We will personalise your experience</p>

            <div className="space-y-5">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>Experience level</p>
                <div className="space-y-2">
                  <Radio name="experience" value="beginner" label="Beginner — new to trading" checked={form.experience === "beginner"} onSelect={selectRadio} />
                  <Radio name="experience" value="intermediate" label="Intermediate — 1–3 years" checked={form.experience === "intermediate"} onSelect={selectRadio} />
                  <Radio name="experience" value="expert" label="Expert — 3+ years" checked={form.experience === "expert"} onSelect={selectRadio} />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>What do you trade?</p>
                <div className="space-y-2">
                  <Radio name="trades" value="equity" label="Equity (stocks)" checked={form.trades === "equity"} onSelect={selectRadio} />
                  <Radio name="trades" value="fno" label="F&O (futures & options)" checked={form.trades === "fno"} onSelect={selectRadio} />
                  <Radio name="trades" value="both" label="Both" checked={form.trades === "both"} onSelect={selectRadio} />
                </div>
              </div>
              <button
                className="w-full py-3 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#061110" }}
                disabled={!form.experience || !form.trades}
                onClick={() => setStep(1)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Capture */}
        {step === 1 && (
          <div className="p-6" style={cardStyle}>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>Choose your first value</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>Most traders should start by logging one recent trade. Broker connection can wait.</p>

            <div className="grid gap-2 mb-5 sm:grid-cols-3">
              {[
                { value: "journal", title: "Log first trade", text: "Fastest path to review, win rate, and mistake tracking." },
                { value: "scanner", title: "Run scanner", text: "Find a shortlist before moving into chart review." },
                { value: "broker", title: "Connect broker", text: "Use this only if you are ready with API credentials." },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, first_value: item.value }))}
                  className="text-left rounded-[12px] p-4 transition-all"
                  style={form.first_value === item.value
                    ? { border: "1px solid var(--accent)", background: "var(--accent-subtle)" }
                    : { border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="text-[13px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.text}</div>
                </button>
              ))}
            </div>

            <h3 className="text-[14px] font-bold mb-2" style={{ color: "var(--text-primary)" }}>Optional broker connection</h3>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {BROKERS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setForm((f) => ({ ...f, broker: b.value }))}
                  className="flex items-center gap-2 p-3 rounded-[8px] text-left transition-all"
                  style={form.broker === b.value
                    ? { border: "1px solid var(--accent)", background: "var(--accent-subtle)" }
                    : { border: "1px solid rgba(255,255,255,0.08)", background: "transparent" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold"
                    style={form.broker === b.value
                      ? { background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#061110" }
                      : { background: "rgba(255,255,255,0.03)", color: "var(--text-tertiary)" }}>
                    {b.logo}
                  </div>
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{b.label}</span>
                </button>
              ))}
            </div>

            {zerodhaSelected && (
              <div className="space-y-3 mb-4 p-4 rounded-[14px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                  Zerodha Kite Connect — enter your API credentials
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Get your API key & secret from{" "}
                  <span style={{ color: "var(--accent)" }}>developers.kite.trade</span>.
                  Set redirect URL to <code className="px-1 rounded text-[10px]" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)" }}>http://localhost:3000/broker/callback</code>
                </p>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--text-tertiary)" }}>API Key</label>
                  <input
                    type="text"
                    value={form.broker_api_key}
                    onChange={e => setForm(f => ({ ...f, broker_api_key: e.target.value }))}
                    placeholder="kitexxxxxxxxxxx"
                    className="w-full text-[13px] rounded-[8px] px-3 py-2 outline-none font-mono"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--text-tertiary)" }}>API Secret</label>
                  <input
                    type="password"
                    value={form.broker_api_secret}
                    onChange={e => setForm(f => ({ ...f, broker_api_secret: e.target.value }))}
                    placeholder="••••••••••••••••"
                    className="w-full text-[13px] rounded-[8px] px-3 py-2 outline-none"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 rounded-[8px] text-[14px] font-semibold transition-colors"
                style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)", background: "transparent" }}
                onClick={() => setStep(2)}>
                Skip for now
              </button>
              <button
                className="flex-1 py-2.5 rounded-[8px] text-[14px] font-bold text-white"
                style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#061110" }}
                onClick={() => setStep(2)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — All set */}
        {step === 2 && (
          <div className="p-6" style={cardStyle}>
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-[28px] mx-auto mb-3"
                style={{ background: "rgba(38,166,91,0.15)", color: "var(--gain)" }}>
                ✓
              </div>
              <h2 className="text-[20px] font-bold" style={{ color: "var(--text-primary)" }}>You are all set!</h2>
              <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {form.broker && form.broker !== "none"
                  ? `Broker set to ${BROKERS.find(b => b.value === form.broker)?.label}. You can connect it in Settings anytime.`
                  : "You can connect a broker later in Settings."}
              </p>
            </div>

            <div className="grid gap-3 mb-5 sm:grid-cols-3">
              {[
                { title: "Run a scan", text: "Find breakouts and high relative-strength stocks.", href: "/scanner" },
                { title: "Log first trade", text: "Capture one recent trade and unlock your first review habit.", href: "/journal" },
                { title: "Starter queue", text: "Create a sample watchlist with liquid names and setup scoring.", href: "/watchlist", seed: true },
              ].map((item) => (
                <button
                  key={item.href}
                  type="button"
                  disabled={loading}
                  onClick={() => finish(item.href, Boolean(item.seed))}
                  className="text-left rounded-[12px] p-4 transition-opacity disabled:opacity-60"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[13px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>{item.title}</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.text}</div>
                </button>
              ))}
            </div>

            {error && (
              <div className="text-[12px] rounded-[8px] px-3 py-2 mb-3"
                style={{ background: "rgba(229,56,59,0.1)", border: "1px solid rgba(229,56,59,0.25)", color: "#f87171" }}>
                {error}
              </div>
            )}

            <button
              className="w-full py-3 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
              style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "#061110" }}
              disabled={loading}
              onClick={() => finish(form.first_value === "scanner" ? "/scanner" : form.first_value === "broker" ? "/settings/broker" : "/journal")}>
              {loading ? "Setting up…" : form.first_value === "scanner" ? "Run first scan →" : form.first_value === "broker" ? "Connect broker →" : "Log first trade →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
