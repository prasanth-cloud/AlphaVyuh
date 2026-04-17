"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-full bg-[#f2f2f0]">
      <div className="bg-white border-b border-[#e2e2df] px-5 py-5">
        <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight">Terms of Service</div>
        <div className="text-[12px] text-[#aaa] mt-0.5">Last updated: April 2026</div>
      </div>

      <div className="max-w-2xl px-5 py-8 space-y-6 text-[14px] text-[#444] leading-relaxed">

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using AlphaVyuh (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">2. Description of Service</h2>
          <p>
            AlphaVyuh is a trading tools platform that provides stock screening, charting, trade journaling,
            and AI-powered analysis. The Platform is intended for educational and informational purposes only.

          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">3. Not Investment Advice</h2>
          <p className="font-medium text-[#e5383b] mb-2">
            AlphaVyuh is not a SEBI-registered investment advisor.
          </p>
          <p>
            Nothing on this Platform constitutes investment advice, financial advice, trading advice, or any
            other sort of advice. All content is for informational and educational purposes only. You should
            consult a registered financial advisor before making any investment decisions.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">4. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all
            activities that occur under your account. You must notify us immediately of any unauthorized use.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">5. Subscriptions and Payments</h2>
          <p>
            Paid plans are billed through Razorpay. Subscriptions are valid for the period purchased (30 days
            for monthly, 365 days for annual) and do not auto-renew. No refunds are provided after plan activation.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">6. Broker Integrations</h2>
          <p>
            Broker connections (Zerodha, Upstox, etc.) are provided as a convenience. AlphaVyuh is not
            responsible for order execution, slippage, or any losses arising from trades placed through
            broker integrations. Always verify orders on your broker&apos;s platform.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">7. Data Accuracy</h2>
          <p>
            Market data is sourced from NSE Bhavcopy and Yahoo Finance. We do not guarantee the accuracy,
            completeness, or timeliness of any data. Do not rely solely on this data for trading decisions.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">8. Prohibited Uses</h2>
          <p>You may not use the Platform to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Violate any applicable law or regulation</li>
            <li>Reverse engineer or copy the Platform</li>
            <li>Attempt to gain unauthorized access to any system</li>
            <li>Use automated scripts to scrape or overload the Platform</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, AlphaVyuh shall not be liable for any indirect, incidental,
            special, or consequential damages arising from your use of the Platform, including any trading losses.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">10. Governing Law</h2>
          <p>
            These terms are governed by the laws of India. Any disputes shall be subject to the exclusive
            jurisdiction of courts in Bengaluru, Karnataka, India.
          </p>
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-[#1c1c1a] mb-2">11. Changes to Terms</h2>
          <p>
            We may update these terms at any time. Continued use of the Platform after changes constitutes
            acceptance of the new terms. We will notify registered users of material changes by email.
          </p>
        </section>

        <div className="pt-4 border-t border-[#e2e2df] text-[12px] text-[#aaa]">
          Questions? Contact us at{" "}
          <a href="mailto:support@alphavyuh.com" className="text-[#5b63f5] hover:underline">
            support@alphavyuh.com
          </a>
          {" · "}
          <Link href="/privacy" className="text-[#5b63f5] hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
