"use client";

import Link from "next/link";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing or using AlphaVyuh, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.",
  },
  {
    title: "2. Description of Service",
    body: "AlphaVyuh provides stock screening, charting, watchlist workflow, trade planning, broker import workflows, journaling, and review tools for educational and informational use.",
  },
  {
    title: "3. Not Investment Advice",
    body: "AlphaVyuh is not a SEBI-registered investment advisor. Nothing on the platform is investment advice, financial advice, trading advice, or a recommendation to buy or sell securities. Trading decisions remain the user's responsibility.",
    warning: true,
  },
  {
    title: "4. User Accounts",
    body: "You are responsible for maintaining account security and for all activity under your account. Notify us immediately if you suspect unauthorized use.",
  },
  {
    title: "5. Subscriptions and Payments",
    body: "Paid plans are billed through Razorpay only when billing is configured and enabled. Until then, billing surfaces may show access-managed checkout controls. AlphaVyuh does not store card numbers or bank details.",
  },
  {
    title: "6. Broker Integrations",
    body: "Broker connections support read-only smoke, profile, holdings, positions, orderbook, tradebook, filled-trade import, and journal capture. Live and sandbox broker order placement are not enabled yet.",
  },
  {
    title: "7. Data Accuracy",
    body: "Market data may come from exchange files, configured provider paths, delayed feeds, broker APIs, or clearly labeled fallback/demo data. Different data sources and refresh timings are not interchangeable. Always verify market data before trading.",
  },
  {
    title: "8. Third-Party Notices",
    body: "AlphaVyuh charting uses TradingView Lightweight Charts, licensed under the Apache License, Version 2.0. TradingView is the product creator of Lightweight Charts.",
  },
  {
    title: "9. Prohibited Uses",
    body: "You may not violate laws, reverse engineer the platform, attempt unauthorized access, scrape or overload systems, or use AlphaVyuh to bypass broker security controls.",
  },
  {
    title: "10. Limitation of Liability",
    body: "To the maximum extent permitted by law, AlphaVyuh is not liable for indirect, incidental, special, consequential, or trading-loss damages arising from platform use.",
  },
  {
    title: "11. Governing Law",
    body: "These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in Bengaluru, Karnataka, India.",
  },
  {
    title: "12. Changes to Terms",
    body: "We may update these terms. Continued use after changes constitutes acceptance. Registered users will be notified of material changes by email or in-product notice.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6" style={{ background: "var(--bg-app)", color: "var(--text-primary)" }}>
      <div className="workspace-hero mb-4" style={{ padding: "18px 20px" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-tertiary)" }}>
              Legal
            </div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Terms of Service</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>Last updated: April 2026</p>
          </div>
          <Link
            href="/privacy"
            className="rounded-[8px] px-3 py-2 text-[12px] font-semibold"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
          >
            Privacy Policy
          </Link>
        </div>
      </div>

      <div className="workspace-card max-w-3xl space-y-6" style={{ padding: "20px" }}>
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{section.title}</h2>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: section.warning ? "var(--loss)" : "var(--text-secondary)" }}
            >
              {section.body}
            </p>
          </section>
        ))}

        <div className="border-t pt-4 text-[12px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}>
          Questions? Contact{" "}
          <a href="mailto:support@alphavyuh.com" className="font-semibold" style={{ color: "var(--accent)" }}>
            support@alphavyuh.com
          </a>
          .
        </div>
      </div>
    </div>
  );
}
