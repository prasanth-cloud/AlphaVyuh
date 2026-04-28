import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export default function BlogPage() {
  return (
    <MarketingInfoPage
      eyebrow="Blog"
      title="Notes on trading process, product, and Indian markets."
      intro="The AlphaVyuh blog will publish practical notes for traders who care about repeatable workflows rather than random signals."
      sections={[
        { title: "Trading workflow", body: "How to move from scan results to a smaller, cleaner watchlist without overtrading." },
        { title: "Product updates", body: "Release notes and improvements across scanner, watchlist, charts, broker connectivity, and journal review." },
        { title: "Data and reliability", body: "How AlphaVyuh thinks about market data quality, fallback behavior, and transparent product signals." },
      ]}
      ctaLabel="Start using AlphaVyuh"
    />
  );
}
