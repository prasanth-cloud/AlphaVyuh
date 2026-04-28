import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export default function ProductsPage() {
  return (
    <MarketingInfoPage
      eyebrow="Products"
      title="One connected trading workflow."
      intro="AlphaVyuh brings discovery, watchlist management, chart context, execution readiness, and post-trade review into a single operating system for Indian market participants."
      sections={[
        { id: "scanner", title: "Scanner", body: "Build cleaner shortlists from market data, presets, and filters designed for daily NSE/BSE workflows." },
        { title: "Watchlist desk", body: "Move symbols from discovery into an active desk where chart context, notes, and priorities stay visible." },
        { title: "Charts and planning", body: "Review price action, levels, indicators, and trade context without losing the reason a stock entered your process." },
        { id: "journal", title: "Journal and review", body: "Capture closed trades, review patterns, and turn execution history into repeatable process improvements." },
      ]}
    />
  );
}
