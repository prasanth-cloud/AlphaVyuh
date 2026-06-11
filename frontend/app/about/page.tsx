import type { Metadata } from "next";
import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export const metadata: Metadata = {
  title: "About — AlphaVyuh",
  description: "Why AlphaVyuh exists and how it helps Indian swing traders run a disciplined daily workflow.",
};

export default function AboutPage() {
  return (
    <MarketingInfoPage
      eyebrow="About"
      title="A workflow system for Indian swing traders."
      intro="AlphaVyuh connects the steps most traders run in separate tools — scanning after market close, working a watchlist, planning charts, and reviewing a journal — into one desk flow where context never gets lost."
      sections={[
        { title: "What we build", body: "An EOD-first trading workflow platform for NSE/BSE cash equities: dashboard checkpoint, scanner discovery, watchlist analysis desk, chart planning, and journal review. Every step keeps the scan reason, levels, notes, and outcome attached." },
        { title: "What we believe", body: "Process beats prediction. Traders improve when their own closed trades show them what works. AlphaVyuh exists to make that review loop fast, honest, and routine — not to hand out trade calls." },
        { title: "What we are not", body: "AlphaVyuh is not SEBI registered and does not provide investment advice, tips, or recommendations. Data is end-of-day first, broker activity is import-only, and you stay in full control of every decision." },
        { title: "Where we are", body: "Built in India for Indian markets. The platform is in early access while we harden the scanner, journal, and broker import flows with a small group of traders." },
      ]}
      ctaLabel="Get started"
      ctaHref="/signup"
    />
  );
}
