"use client";

import Link from "next/link";

const sections = [
  {
    title: "1. Information We Collect",
    body: (
      <>
        <p>We collect the following information when you use AlphaVyuh:</p>
        <ul>
          <li><strong>Account data:</strong> email address and display name.</li>
          <li><strong>Usage data:</strong> saved screens, watchlists, journal entries, scan history, and workflow state.</li>
          <li><strong>Broker credentials:</strong> API keys you enter for read-only broker workflows, stored encrypted where configured.</li>
          <li><strong>Payment data:</strong> processed by Razorpay when billing is enabled; AlphaVyuh stores only plan status and order IDs.</li>
          <li><strong>Telegram Chat ID:</strong> only when you provide it for alerts.</li>
        </ul>
      </>
    ),
  },
  {
    title: "2. How We Use Your Information",
    body: (
      <ul>
        <li>Operate the platform, authentication, scanners, watchlists, charts, journal, and workflow state.</li>
        <li>Process payments and manage subscriptions when billing is enabled.</li>
        <li>Send scan alerts only when you opt in.</li>
        <li>Generate trade reviews from your journal records inside AlphaVyuh.</li>
        <li>Improve reliability, fix bugs, and protect the service from abuse.</li>
      </ul>
    ),
  },
  {
    title: "3. Third-Party Services",
    body: (
      <>
        <p>AlphaVyuh uses trusted third-party services for core operations:</p>
        <ul>
          <li><strong>Supabase</strong> for database and authentication.</li>
          <li><strong>Razorpay</strong> for payment processing when billing is enabled.</li>
          <li><strong>NSE/EOD provider paths</strong> and configured market-data providers for market data.</li>
          <li><strong>Telegram</strong> for optional scan alert notifications.</li>
        </ul>
        <p className="mt-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          Journal-wide reviews are generated from recorded trades and notes inside AlphaVyuh. We do not expose broker tokens or secrets in UI, logs, screenshots, or PR evidence.
        </p>
      </>
    ),
  },
  {
    title: "4. Data Storage and Security",
    body: (
      <p>
        User-owned data is stored with Supabase Row Level Security assumptions so users can access only their own records. Broker API secrets are stored with additional protection where broker connectivity is configured. We do not store payment card numbers or bank account details.
      </p>
    ),
  },
  {
    title: "5. Data Retention",
    body: (
      <p>
        We retain your data while your account is active. If you delete your account, personal data is deleted within 30 days where legally and technically feasible. Journal records and saved workflow data are removed as part of account deletion.
      </p>
    ),
  },
  {
    title: "6. Your Rights",
    body: (
      <ul>
        <li>Access your account and journal data inside the platform.</li>
        <li>Correct inaccurate profile data in Settings.</li>
        <li>Export journal data where export tools are available.</li>
        <li>Request account deletion and removal of associated user-owned records.</li>
      </ul>
    ),
  },
  {
    title: "7. Cookies",
    body: <p>We use essential cookies required for authentication and session continuity. We do not use advertising cookies.</p>,
  },
  {
    title: "8. Changes to This Policy",
    body: <p>We may update this policy from time to time. Registered users will be notified of material changes by email or in-product notice.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6" style={{ background: "var(--bg-app)", color: "var(--text-primary)" }}>
      <div className="workspace-hero mb-4" style={{ padding: "18px 20px" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-tertiary)" }}>
              Legal
            </div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Privacy Policy</h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>Last updated: April 2026</p>
          </div>
          <Link
            href="/terms"
            className="rounded-[8px] px-3 py-2 text-[12px] font-semibold"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
          >
            Terms of Service
          </Link>
        </div>
      </div>

      <div className="workspace-card max-w-3xl space-y-6" style={{ padding: "20px" }}>
        {sections.map((section) => (
          <section key={section.title} className="[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:leading-relaxed [&_li]:leading-relaxed">
            <h2 className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{section.title}</h2>
            <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{section.body}</div>
          </section>
        ))}

        <div className="border-t pt-4 text-[12px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}>
          Questions? Contact{" "}
          <a href="mailto:privacy@alphavyuh.com" className="font-semibold" style={{ color: "var(--accent)" }}>
            privacy@alphavyuh.com
          </a>
          .
        </div>
      </div>
    </div>
  );
}
