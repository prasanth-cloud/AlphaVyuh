import MarketingInfoPage from "@/components/marketing/MarketingInfoPage";

export default function ContactPage() {
  return (
    <MarketingInfoPage
      eyebrow="Contact"
      title="Talk to the AlphaVyuh team."
      intro="Use this page for product questions, partnerships, data-provider conversations, brokerage integrations, and support requests."
      sections={[
        { title: "Product and support", body: "For account, onboarding, or workflow questions, write to support@alphavyuh.com with your registered email and a short description." },
        { title: "Partnerships", body: "For data, broker, education, or distribution partnerships, write to partnerships@alphavyuh.com with the relevant context." },
        { title: "Security", body: "For security concerns or responsible disclosure, write to security@alphavyuh.com. Please do not include sensitive account secrets in email." },
      ]}
      ctaLabel="Sign in"
      ctaHref="/login"
    />
  );
}
