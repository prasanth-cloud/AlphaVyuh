import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export default function PoliciesPage() {
  return (
    <MarketingInfoPage
      eyebrow="Policies"
      title="Clear rules for using AlphaVyuh."
      intro="These summaries are written for public visitors. Product-specific legal text can evolve as the platform, billing, and broker integrations mature."
      sections={[
        { id: "privacy", title: "Privacy", body: "AlphaVyuh uses account, product, and trading workflow data to operate the service, secure user access, improve reliability, and support requested features. We do not ask users to share broker secrets outside the intended secure broker connection flow." },
        { id: "terms", title: "Terms", body: "AlphaVyuh is trading workflow software. It is not SEBI-registered investment advice, portfolio management, or a promise of returns. Users remain responsible for trading decisions and broker activity." },
        { title: "Data usage", body: "Market data may come from exchange-authorized providers, broker APIs, or fallback sources depending on configuration and plan. Product surfaces should show data provenance where it matters." },
        { title: "Contact", body: "Questions about privacy, terms, billing, or security can be sent to support@alphavyuh.com." },
      ]}
      ctaLabel="Contact us"
      ctaHref="/contact"
    />
  );
}
