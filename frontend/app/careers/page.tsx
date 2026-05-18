import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export default function CareersPage() {
  return (
    <MarketingInfoPage
      eyebrow="Careers"
      title="Build trading software with discipline."
      intro="AlphaVyuh is focused, product-led, and built around practical trading workflows. We care about practical engineering, clear design, and tools that help traders make better decisions."
      sections={[
        { title: "Current status", body: "We are not listing open roles publicly yet, but we are interested in strong product engineers, market-data engineers, designers, and growth operators." },
        { title: "How we work", body: "We prefer small, high-ownership teams that ship carefully, measure real user friction, and avoid performative complexity." },
        { title: "Reach out", body: "Send a concise note, portfolio, or GitHub/LinkedIn profile to careers@alphavyuh.com if your work is relevant to trading workflows." },
      ]}
      ctaLabel="Contact us"
      ctaHref="/contact"
    />
  );
}
