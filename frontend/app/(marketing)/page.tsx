"use client";

import { useState } from "react";
import Link from "next/link";

const C = {
  bg: "#0A0E13",
  surface: "#12161D",
  surfaceElevated: "#1A1F28",
  borderSubtle: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.10)",
  accent: "#00D9A7",
  accentSubtle: "rgba(0,217,167,0.10)",
  text: "#F1EFE8",
  text2: "#A8A29E",
  text3: "#6A6A6A",
  gain: "#2DB574",
  loss: "#E15560",
} as const;

const FEATURES = [
  {
    eyebrow: "Scanner",
    title: "Find setups in seconds",
    desc: "Run SEPA, VCP, and custom scans across the entire NSE universe. 120ms average scan time. Save presets, set alerts, share with the community.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
    ),
  },
  {
    eyebrow: "Watchlist",
    title: "Organize by setup type",
    desc: "Create watchlists for breakouts, VCP contractions, or any other setup. Each symbol carries its scan reason, chart notes, and broker context.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    eyebrow: "Journal",
    title: "Every trade, auto-captured",
    desc: "Entry, exit, size, R-multiple, setup tag, and screenshot — logged automatically from your broker. No manual entry. No missed trades.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
      </svg>
    ),
  },
  {
    eyebrow: "AI review",
    title: "Pattern observations from your history",
    desc: "After enough trades, the journal is analyzed for patterns: winning setups, repeated mistakes, sizing behaviour. Observations only — never advice.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/>
        <circle cx="12" cy="14" r="2"/>
        <path d="M12 16v2"/>
      </svg>
    ),
  },
];

const PLANS = [
  {
    name: "Free",
    monthly: "₹0",
    annual: null,
    features: [
      "50 scanner results per scan",
      "1 watchlist, 20 stocks",
      "Basic charts (EMA + RSI)",
      "3-month journal history",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    monthly: "₹1,999",
    monthlyNote: "/mo",
    annual: "₹16,800",
    annualNote: "/yr",
    features: [
      "500 scanner results, unlimited scans",
      "10 watchlists, 200 stocks each",
      "All chart indicators",
      "Full journal + AI trade review",
      "Zerodha + Upstox broker connect",
      "US stocks (NASDAQ + NYSE)",
    ],
    cta: "Get started",
    featured: true,
  },
  {
    name: "Elite",
    monthly: "₹4,999",
    monthlyNote: "/mo",
    annual: "₹41,990",
    annualNote: "/yr",
    features: [
      "Everything in Pro",
      "5 team seats + API access",
      "Priority data feed",
      "Custom alerts (email + Telegram)",
      "White-label journal exports",
      "Dedicated support",
    ],
    cta: "Get started",
    featured: false,
  },
];

export default function MarketingPage() {
  const [annual, setAnnual] = useState(false);
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setWaitlistStatus("loading");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${API}/api/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "marketing_page" }),
      });
      if (!res.ok) throw new Error();
      setWaitlistStatus("done");
    } catch {
      setWaitlistStatus("error");
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh" }}>
      {/* Nav */}
      <nav style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: C.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: C.bg }}>A</span>
          </div>
          <span style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.03em" }}>AlphaVyuh</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <a href="#features" style={{ fontSize: 15, fontWeight: 500, color: C.text2, textDecoration: "none" }}>Features</a>
          <a href="#pricing" style={{ fontSize: 15, fontWeight: 500, color: C.text2, textDecoration: "none" }}>Pricing</a>
          <Link href="/login" style={{ fontSize: 15, fontWeight: 500, color: C.text2, textDecoration: "none" }}>Log in</Link>
          <Link href="/signup" style={{ padding: "10px 20px", background: C.accent, color: C.bg, borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "100px 32px 120px", textAlign: "center" }}>
        <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: C.accent, marginBottom: 20 }}>
          India&apos;s trading OS
        </span>
        <h1 style={{ fontSize: "clamp(48px, 5vw, 72px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 900, margin: "0 auto 24px" }}>
          Scan, organize, execute, review.
        </h1>
        <p style={{ fontSize: 18, color: C.text2, lineHeight: 1.6, maxWidth: 640, margin: "0 auto 40px" }}>
          Scan markets, build watchlists, analyze charts, trade through your broker, and review your performance — all in one place.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" style={{ padding: "14px 32px", background: C.accent, color: C.bg, borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            Start free
          </Link>
          <a href="#features" style={{ padding: "14px 32px", border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: "none" }}>
            See how it works
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ background: C.surface, borderTop: `1px solid ${C.borderSubtle}`, padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: C.accent }}>
              Workflow
            </span>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 12 }}>
              The complete trading loop
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {FEATURES.map(f => (
              <div key={f.eyebrow} style={{ padding: 28, borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg }}>
                <div style={{ marginBottom: 16 }}>{f.icon}</div>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: C.accent }}>
                  {f.eyebrow}
                </span>
                <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 8, marginBottom: 12 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 15, color: C.text2, lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: "100px 0", borderTop: `1px solid ${C.borderSubtle}` }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: C.accent }}>
              Pricing
            </span>
            <h2 style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 12 }}>
              Simple, transparent pricing
            </h2>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 24 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: annual ? C.text3 : C.text }}>Monthly</span>
              <button
                onClick={() => setAnnual(!annual)}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative",
                  background: annual ? C.accent : C.surfaceElevated,
                }}
                data-testid="pricing-toggle"
              >
                <span style={{
                  position: "absolute", top: 3, left: annual ? 25 : 3,
                  width: 20, height: 20, borderRadius: 10, background: annual ? C.bg : C.text2,
                  transition: "left 0.2s",
                }} />
              </button>
              <span style={{ fontSize: 14, fontWeight: 500, color: annual ? C.text : C.text3 }}>Annual <span style={{ color: C.accent, fontSize: 12 }}>save 30%</span></span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, maxWidth: 960, margin: "0 auto" }}>
            {PLANS.map(plan => (
              <div
                key={plan.name}
                style={{
                  padding: 32, borderRadius: 14, position: "relative",
                  background: C.surface,
                  border: plan.featured ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                }}
              >
                {plan.featured && (
                  <div style={{
                    position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                    padding: "4px 16px", borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.1em", background: C.accent, color: C.bg,
                  }}>
                    Most popular
                  </div>
                )}
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{plan.name}</h3>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em" }}>
                    {annual && plan.annual ? plan.annual : plan.monthly}
                  </span>
                  {(annual ? plan.annualNote : plan.monthlyNote) && (
                    <span style={{ fontSize: 15, color: C.text3 }}>{annual ? plan.annualNote : plan.monthlyNote}</span>
                  )}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px" }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, fontSize: 14, color: C.text2 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                        <circle cx="12" cy="12" r="10" stroke={C.accent} strokeWidth="1.5"/>
                        <path d="M8 12l3 3 5-5" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  style={{
                    display: "block", textAlign: "center", padding: "12px 0", borderRadius: 8,
                    fontSize: 14, fontWeight: 600, textDecoration: "none",
                    background: plan.featured ? C.accent : "transparent",
                    color: plan.featured ? C.bg : C.accent,
                    border: plan.featured ? "none" : `1px solid ${C.accent}`,
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: C.text3 }}>
            Pricing shown for planning. Billing enabled per approved account.
          </p>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" style={{ background: C.surface, borderTop: `1px solid ${C.borderSubtle}`, padding: "100px 0" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 32px", textAlign: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: C.accent }}>
            Early access
          </span>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 12, marginBottom: 16 }}>
            Join the waitlist
          </h2>
          <p style={{ fontSize: 15, color: C.text2, lineHeight: 1.6, marginBottom: 32 }}>
            We&apos;re onboarding serious traders one by one. Drop your email and we&apos;ll reach out when your slot opens.
          </p>

          {waitlistStatus === "done" ? (
            <div style={{ padding: "16px 24px", borderRadius: 10, background: C.accentSubtle, color: C.accent, fontSize: 15, fontWeight: 600 }} data-testid="waitlist-success">
              You&apos;re on the list. We&apos;ll be in touch.
            </div>
          ) : (
            <form onSubmit={handleWaitlist} style={{ display: "flex", gap: 12, maxWidth: 440, margin: "0 auto" }} data-testid="waitlist-form">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
                  background: C.surfaceElevated, color: C.text, fontSize: 15, outline: "none",
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
                data-testid="waitlist-email"
              />
              <button
                type="submit"
                disabled={waitlistStatus === "loading"}
                style={{
                  padding: "14px 24px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: C.accent, color: C.bg, fontSize: 14, fontWeight: 600,
                  opacity: waitlistStatus === "loading" ? 0.6 : 1,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
                data-testid="waitlist-submit"
              >
                {waitlistStatus === "loading" ? "Joining..." : "Join waitlist"}
              </button>
            </form>
          )}
          {waitlistStatus === "error" && (
            <p style={{ marginTop: 12, fontSize: 13, color: C.loss }}>Something went wrong. Try again.</p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.borderSubtle}`, padding: "48px 0 32px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div style={{ fontSize: 13, color: C.text3 }}>
            &copy; {new Date().getFullYear()} AlphaVyuh. Not investment advice.
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/privacy" style={{ fontSize: 13, color: C.text3, textDecoration: "none" }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: 13, color: C.text3, textDecoration: "none" }}>Terms</Link>
            <a href="mailto:support@alphavyuh.com" style={{ fontSize: 13, color: C.text3, textDecoration: "none" }}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
