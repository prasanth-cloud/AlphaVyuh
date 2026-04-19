"use client";

import { useState } from "react";
import { updateMe } from "@/lib/api";

const STEPS = ["About you", "Your broker", "Get started"];

type FormState = {
  experience: string;
  trades: string;
  broker: string;
  broker_api_key: string;
  broker_api_secret: string;
};

const BROKERS = [
  { value: "zerodha",  label: "Zerodha",   logo: "Z" },
  { value: "upstox",   label: "Upstox",    logo: "U" },
  { value: "fyers",    label: "Fyers",     logo: "F" },
  { value: "angel",    label: "Angel One", logo: "A" },
  { value: "other",    label: "Other",     logo: "?" },
  { value: "none",     label: "None yet",  logo: "–" },
];

const cardStyle = { background: "var(--app-surface2)", border: "1px solid var(--app-border)", borderRadius: "14px" };
const inputStyle = { background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text1)" };

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({
    experience: "", trades: "", broker: "", broker_api_key: "", broker_api_secret: "",
  });

  function Radio({ name, value, label }: { name: keyof FormState; value: string; label: string }) {
    const checked = form[name] === value;
    return (
      <label className="flex items-center gap-3 p-3 rounded-[8px] border cursor-pointer transition-colors"
        style={checked
          ? { border: "1px solid #5b63f5", background: "rgba(91,99,245,0.1)" }
          : { border: "1px solid var(--app-border)", background: "transparent" }}>
        <input type="radio" name={name} value={value} checked={checked}
          onChange={() => setForm((f) => ({ ...f, [name]: value }))}
          className="accent-[#5b63f5]" />
        <span className="text-[14px]" style={{ color: "var(--app-text1)" }}>{label}</span>
      </label>
    );
  }

  async function finish() {
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
      window.location.replace("/dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  const zerodhaSelected = form.broker === "zerodha";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--app-bg)" }}>
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                style={i <= step
                  ? { background: "#5b63f5", color: "#fff" }
                  : { background: "var(--app-surface3)", border: "1px solid var(--app-border)", color: "var(--app-text3)" }}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className="text-[13px]"
                style={{ color: i === step ? "var(--app-text1)" : "var(--app-text3)", fontWeight: i === step ? 600 : 400 }}>
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px" style={{ background: i < step ? "#5b63f5" : "var(--app-border)" }} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — About you */}
        {step === 0 && (
          <div className="p-6" style={cardStyle}>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--app-text1)" }}>Tell us about yourself</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--app-text3)" }}>We will personalise your experience</p>

            <div className="space-y-5">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--app-text3)" }}>Experience level</p>
                <div className="space-y-2">
                  <Radio name="experience" value="beginner" label="Beginner — new to trading" />
                  <Radio name="experience" value="intermediate" label="Intermediate — 1–3 years" />
                  <Radio name="experience" value="expert" label="Expert — 3+ years" />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--app-text3)" }}>What do you trade?</p>
                <div className="space-y-2">
                  <Radio name="trades" value="equity" label="Equity (stocks)" />
                  <Radio name="trades" value="fno" label="F&O (futures & options)" />
                  <Radio name="trades" value="both" label="Both" />
                </div>
              </div>
              <button
                className="w-full py-3 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: "#5b63f5" }}
                disabled={!form.experience || !form.trades}
                onClick={() => setStep(1)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Broker */}
        {step === 1 && (
          <div className="p-6" style={cardStyle}>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--app-text1)" }}>Connect your broker</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--app-text3)" }}>Orders placed on AlphaVyuh will route through your broker</p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {BROKERS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setForm((f) => ({ ...f, broker: b.value }))}
                  className="flex items-center gap-2 p-3 rounded-[8px] text-left transition-all"
                  style={form.broker === b.value
                    ? { border: "1px solid #5b63f5", background: "rgba(91,99,245,0.1)" }
                    : { border: "1px solid var(--app-border)", background: "transparent" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold"
                    style={form.broker === b.value
                      ? { background: "#5b63f5", color: "#fff" }
                      : { background: "var(--app-surface3)", color: "var(--app-text3)" }}>
                    {b.logo}
                  </div>
                  <span className="text-[13px] font-medium" style={{ color: "var(--app-text1)" }}>{b.label}</span>
                </button>
              ))}
            </div>

            {zerodhaSelected && (
              <div className="space-y-3 mb-4 p-4 rounded-[8px]" style={{ background: "var(--app-surface3)", border: "1px solid var(--app-border)" }}>
                <p className="text-[12px] font-semibold" style={{ color: "#5b63f5" }}>
                  Zerodha Kite Connect — enter your API credentials
                </p>
                <p className="text-[11px]" style={{ color: "var(--app-text3)" }}>
                  Get your API key & secret from{" "}
                  <span style={{ color: "#5b63f5" }}>developers.kite.trade</span>.
                  Set redirect URL to <code className="px-1 rounded text-[10px]" style={{ background: "var(--app-surface2)", color: "var(--app-text2)" }}>http://localhost:3000/broker/callback</code>
                </p>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--app-text3)" }}>API Key</label>
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
                  <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--app-text3)" }}>API Secret</label>
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
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text3)", background: "transparent" }}
                onClick={() => setStep(2)}>
                Skip for now
              </button>
              <button
                className="flex-1 py-2.5 rounded-[8px] text-[14px] font-bold text-white"
                style={{ background: "#5b63f5" }}
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
                style={{ background: "rgba(38,166,91,0.15)" }}>
                ✓
              </div>
              <h2 className="text-[20px] font-bold" style={{ color: "var(--app-text1)" }}>You are all set!</h2>
              <p className="text-[13px] mt-1" style={{ color: "var(--app-text3)" }}>
                {form.broker && form.broker !== "none"
                  ? `Broker set to ${BROKERS.find(b => b.value === form.broker)?.label}. You can connect it in Settings anytime.`
                  : "You can connect a broker later in Settings."}
              </p>
            </div>

            <div className="space-y-2 mb-5 text-[13px]" style={{ color: "var(--app-text2)" }}>
              {[
                "Scan stocks with 35+ filters on the Scanner page",
                "Add them to a Watchlist to track closely",
                "Open a Chart, analyse, then click BUY or SELL",
                "Every order auto-records in your Journal — AI reviews your mistakes",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="font-bold mt-0.5" style={{ color: "#5b63f5" }}>{i + 1}.</span>
                  <span>{text}</span>
                </div>
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
              style={{ background: "#5b63f5" }}
              disabled={loading}
              onClick={finish}>
              {loading ? "Setting up…" : "Go to Dashboard →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
