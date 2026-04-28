"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-full bg-[#f2f2f0]">
      <div className="bg-white border-b border-[#e2e2df] px-5 py-5">
        <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight">Privacy Policy</div>
        <div className="text-[12px] text-[#aaa] mt-0.5">Last updated: April 2026</div>
      </div>

      <div className="max-w-2xl px-5 py-8 space-y-6 text-[14px] text-[#444] leading-relaxed">

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">1. Information We Collect</h2>
          <p className="mb-2">We collect the following information when you use AlphaVyuh:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Account data:</strong> Email address, display name</li>
            <li><strong>Usage data:</strong> Saved screens, watchlists, trade journal entries, scan history</li>
            <li><strong>Broker credentials:</strong> API keys you enter (stored encrypted)</li>
            <li><strong>Payment data:</strong> Processed by Razorpay — we only store plan status and order IDs</li>
            <li><strong>Telegram Chat ID:</strong> Only if you provide it for alerts</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">2. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>To operate and maintain the Platform</li>
            <li>To process payments and manage subscriptions</li>
            <li>To send scan alert notifications (only if opted in)</li>
            <li>To generate trade reviews from your journal records inside AlphaVyuh</li>
            <li>To improve Platform features and fix bugs</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">3. Third-Party Services</h2>
          <p className="mb-2">We use the following third-party services:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Supabase</strong> — Database and authentication (servers in AWS ap-south-1)</li>
            <li><strong>Razorpay</strong> — Payment processing (PCI-DSS compliant)</li>
            <li><strong>Yahoo Finance / NSE</strong> — Market data</li>
            <li><strong>Telegram</strong> — Optional scan alert notifications</li>
          </ul>
          <p className="mt-2 text-[12px] text-[#888]">
            Journal-wide reviews are generated from your recorded trades and notes inside AlphaVyuh.
            We do not send your journal to an external AI provider for this feature.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">4. Data Storage and Security</h2>
          <p>
            All data is stored in Supabase (PostgreSQL) with Row Level Security (RLS) — meaning each user
            can only access their own data. Broker API secrets are stored with additional encryption.
            We do not store payment card numbers or bank account details.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">5. Data Retention</h2>
          <p>
            We retain your data as long as your account is active. If you delete your account, all
            personal data is permanently deleted within 30 days. Trade journal entries and saved screens
            are deleted immediately upon account deletion.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">6. Your Rights</h2>
          <p className="mb-2">You have the right to:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Access your personal data (available in the Platform)</li>
            <li>Correct inaccurate data (via Settings)</li>
            <li>Delete your account and all associated data</li>
            <li>Export your trade journal data (CSV export in journal)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">7. Cookies</h2>
          <p>
            We use only essential cookies required for authentication (Supabase session tokens).
            We do not use advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">8. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. We will notify registered users of material
            changes by email at least 7 days before they take effect.
          </p>
        </section>

        <div className="pt-4 border-t border-[#e2e2df] text-[12px] text-[#aaa]">
          Questions? Contact us at{" "}
          <a href="mailto:privacy@alphavyuh.com" className="text-[#f4f7fb] hover:underline">
            privacy@alphavyuh.com
          </a>
          {" · "}
          <Link href="/terms" className="text-[#f4f7fb] hover:underline">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
