import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export default function ProductsPage() {
  return (
    <MarketingInfoPage
      eyebrow="Products"
      title="One connected trading workflow."
      intro="AlphaVyuh brings market discovery, watchlist management, chart planning, and post-trade review into one workflow system for Indian market participants."
      sections={[
        { id: "scanner", title: "Scanner", body: "Build cleaner shortlists from market data, presets, and filters designed for daily NSE/BSE workflows." },
        { title: "Watchlist desk", body: "Move symbols from discovery into an active desk where chart context, notes, and priorities stay visible." },
        { title: "Charts and planning", body: "Review price action, levels, indicators, and trade context without losing the reason a stock entered your process." },
        { id: "journal", title: "Journal and review", body: "Capture manual, planned, or imported trades, review patterns, and turn trade history into repeatable process improvements." },
      ]}
    />
  );
}
