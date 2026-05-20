"use client";

import { useEffect, useState } from "react";
import { addToWatchlist, createWatchlist, updateMe } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

const STEPS = ["About you", "Product limits", "Get started"];

type FormState = {
  experience: string;
  trades: string;
  broker: string;
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
    experience: "", trades: "", broker: "",
  });

  const selectRadio = (name: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  useEffect(() => {
    trackEvent("onboarding_viewed", { surface: "professional_access" });
  }, []);

  async function finish(destination = "/dashboard", seedStarterQueue = false) {
    setLoading(true);
    setError("");
    try {
      const updates: Parameters<typeof updateMe>[0] & { broker_type?: string } = { onboarding_completed: true };

      if (form.broker && form.broker !== "none") {
        updates.broker_type = form.broker;
      }

      if (seedStarterQueue) {
        const starter = await createWatchlist("Starter setup queue");
        const failures: string[] = [];
        for (const symbol of STARTER_SYMBOLS) {
          try {
            await addToWatchlist(starter.id, symbol);
          } catch (error) {
            failures.push(error instanceof Error ? error.message : `${symbol} could not be added.`);
          }
        }
        if (failures.length) {
          throw new Error(`Starter queue could not be completed. ${failures[0]}`);
        }
        destination = `/watchlist?id=${encodeURIComponent(starter.id)}&symbol=${encodeURIComponent(STARTER_SYMBOLS[0])}`;
      }

      await updateMe(updates as Parameters<typeof updateMe>[0]);
      trackEvent("onboarding_completed", { broker: form.broker || "unknown", starter_queue: seedStarterQueue });
      window.location.replace(destination);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

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
          <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.02, letterSpacing: "-0.04em", marginBottom: 8 }}>Set up your trading desk.</h1>
          <p style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)" }}>
            AlphaVyuh starts with a structured workflow: scan the latest completed session, move ideas to a watchlist, plan on charts, then journal and review. Broker connections are read-only/import only.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Account-managed access", "EOD market data", "Broker import only", "Execution not enabled yet"].map((label) => (
              <span key={label} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--text-secondary)" }}>
                {label}
              </span>
            ))}
          </div>
        </div>
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                style={i <= step
                  ? { background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }
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
                style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }}
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
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>Understand product limits</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>Use AlphaVyuh as an educational workflow and journal system. It is not investment advice, not live data, and not a broker order terminal.</p>

            <div className="grid gap-2 mb-5 sm:grid-cols-2">
              {[
                ["Account access", "Access is managed while workflow reliability is monitored."],
                ["Market data", "Scans and charts use the latest available market snapshot unless explicitly labeled demo."],
                ["Broker import only", "Broker connections are for read-only smoke and filled-trade import."],
                ["Execution not enabled yet", "Live and sandbox order placement are not enabled yet."],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-[10px] p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-[12px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>{title}</div>
                  <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{detail}</div>
                </div>
              ))}
            </div>

            <p className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>Optional broker import setup</p>

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
                      ? { background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }
                      : { background: "rgba(255,255,255,0.03)", color: "var(--text-tertiary)" }}>
                    {b.logo}
                  </div>
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{b.label}</span>
                </button>
              ))}
            </div>

            {form.broker && form.broker !== "none" && (
              <div className="space-y-3 mb-4 p-4 rounded-[14px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
                  Broker connect happens after onboarding
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  We will only ask you to sign in with your broker from Settings. AlphaVyuh does not ask traders for developer API keys, API secrets, or broker passwords.
                </p>
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
                style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }}
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
                { title: "Starter queue", text: "Create a sample watchlist with liquid names and setup scoring.", href: "/watchlist", seed: true },
                { title: "Open dashboard", text: "Review market pulse, breadth, and account status.", href: "/dashboard" },
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
              style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)" }}
              disabled={loading}
              onClick={() => finish("/dashboard")}>
              {loading ? "Setting up…" : "Go to Dashboard →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
