import Link from "next/link";
import type { ReactNode } from "react";

const supportEmail = "support@alphavyuh.com";

const betaPosture = [
  "Private/founder beta access only",
  "Market data with source and freshness shown in product",
  "Broker read-only checks and filled-trade import only",
  "Live and sandbox broker order placement disabled",
  "Production billing disabled and waitlist-gated",
  "Educational workflow and journal tool, not investment advice",
];

const onboardingChecklist = [
  "Run one scanner preset after reviewing the data freshness badge.",
  "Add at least 3 stocks to a watchlist.",
  "Open the focused watchlist symbol in the full chart.",
  "Create a trade plan with entry, stop, target, thesis, and invalidation.",
  "Save a simulated order draft or import a broker trade, then log/review it in Journal.",
];

const interviewQuestions = [
  "Where did you hesitate or wonder what to do next?",
  "Did the source/freshness labels make the data trustworthy enough for planning?",
  "Did scanner to watchlist to chart feel faster than your current workflow?",
  "What field in the Decision Desk felt missing, noisy, or unclear?",
  "Would the Journal review loop change your next trading session?",
  "What would block you from using AlphaVyuh twice a week during beta?",
];

const limitations = [
  "No live or real-time market-data claim in beta; scanner and chart workflows use the latest completed market session unless explicitly labeled demo/provider.",
  "No investment advice, trade calls, guaranteed accuracy, or promise of returns.",
  "No live/sandbox broker order placement. Place real trades directly with your broker.",
  "Production Razorpay checkout is disabled. Founder access is invite/waitlist-gated.",
  "Broker read-only smoke requires owner-provided tokens and is not run automatically.",
  "Production Supabase changes require reviewed migrations and explicit approval.",
];

export default function BetaPage() {
  return (
    <main className="min-h-screen bg-[#05090c] text-[#f4f7fb]">
      <section className="mx-auto flex w-[min(100%-32px,1080px)] flex-col gap-8 py-10 md:py-16">
        <nav className="flex items-center justify-between gap-4 text-sm">
          <Link href="/" className="font-semibold uppercase tracking-[0.08em] text-[#f4f7fb]">
            AlphaVyuh
          </Link>
          <div className="flex items-center gap-4 text-[#9aa4b2]">
            <Link href="/contact" className="hover:text-[#f4f7fb]">Contact</Link>
            <Link href="/login" className="hover:text-[#f4f7fb]">Sign in</Link>
          </div>
        </nav>

        <header className="border-b border-white/10 pb-8">
          <div className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#c8f7ee]">
            Founder beta operations
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] md:text-6xl">
            Test the complete trading workflow.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#b6c0ce]">
            AlphaVyuh beta testers should move through scanner, watchlist, full chart,
            trade plan, journal, and review. The goal is workflow clarity and trust,
            not live execution or investment advice.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {betaPosture.map((item) => (
            <div key={item} className="rounded-[14px] border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-[#d6dfe8]">
              {item}
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Beta onboarding checklist">
            <ol className="space-y-3 text-sm leading-6 text-[#b6c0ce]">
              {onboardingChecklist.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-[#c8f7ee] text-center text-[11px] font-bold leading-5 text-[#04120d]">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Feedback and bug report paths">
            <div className="space-y-4 text-sm leading-7 text-[#b6c0ce]">
              <p>
                Signed-in users can use the fixed <strong className="text-[#f4f7fb]">Feedback</strong> button
                in the lower-right corner. Choose General feedback, Bug, Data issue, or Feature request.
              </p>
              <p>
                For account, onboarding, workflow, or urgent bug reports, email{" "}
                <a className="font-semibold text-[#c8f7ee]" href={`mailto:${supportEmail}`}>
                  {supportEmail}
                </a>{" "}
                with your registered email, page URL, symbol/timeframe if relevant, expected result,
                actual result, and a screenshot when possible.
              </p>
              <Link href="/contact" className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#f4f7fb]">
                Contact support
              </Link>
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Trader interview questions">
            <ul className="space-y-3 text-sm leading-6 text-[#b6c0ce]">
              {interviewQuestions.map((item) => (
                <li key={item} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                  {item}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Known beta limitations">
            <ul className="space-y-3 text-sm leading-6 text-[#b6c0ce]">
              {limitations.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d97706]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
          <Link href="/signup" className="rounded-full bg-[#c8f7ee] px-5 py-3 text-sm font-bold text-[#04120d]">
            Request founder beta access
          </Link>
          <Link href="/login" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[#f4f7fb]">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-white/10 bg-white/[0.035] p-5 md:p-6">
      <h2 className="mb-4 text-xl font-semibold tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}
