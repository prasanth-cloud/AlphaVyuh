import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import CountUpValue from "@/components/landing/CountUpValue";
import HeroChart from "@/components/landing/HeroChart";
import LandingNav from "@/components/landing/LandingNav";
import LandingReveal from "@/components/landing/LandingReveal";
import MarketMovers from "@/components/landing/MarketMovers";
import MarketTickerStrip from "@/components/landing/MarketTickerStrip";
import styles from "@/components/landing/landing.module.css";
import { heroSymbolForRegion, fetchHistory, fetchIndices, fetchMovers } from "@/lib/market/service";
import { normalizeRegion } from "@/lib/market/region";
import type { MarketRegion } from "@/lib/market/types";

export const metadata: Metadata = {
  title: "alphavyuh — AI-Powered Trading Journal for Systematic Traders",
  description:
    "The trading journal that tells you whether you followed your own rules. Built for NSE/BSE systematic traders running SEPA, VCP, and momentum setups. ₹100/month.",
  metadataBase: new URL("https://alphavyuh.com"),
  openGraph: {
    title: "alphavyuh — AI-Powered Trading Journal for Systematic Traders",
    description:
      "The trading journal that tells you whether you followed your own rules. Built for NSE/BSE systematic traders running SEPA, VCP, and momentum setups. ₹100/month.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "alphavyuh — AI-Powered Trading Journal for Systematic Traders",
    description:
      "The trading journal that tells you whether you followed your own rules. Built for NSE/BSE systematic traders running SEPA, VCP, and momentum setups. ₹100/month.",
  },
};

function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "alphavyuh",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "100",
      priceCurrency: "INR",
    },
    description:
      "AI-powered trading journal for systematic traders running SEPA, VCP, and momentum setups on NSE and BSE.",
  };
}

export default async function LandingPage() {
  const cookieStore = cookies();
  const region = normalizeRegion(cookieStore.get("alphavyuh-region")?.value) as MarketRegion;
  const heroSymbol = heroSymbolForRegion(region);

  const [indices, movers, history] = await Promise.all([
    fetchIndices(region),
    fetchMovers(region),
    fetchHistory(heroSymbol),
  ]);

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema()) }}
      />

      <LandingNav region={region} />
      <MarketTickerStrip region={region} initialData={indices} />

      <div className={styles.shell}>
        <section className={styles.hero}>
          <LandingReveal className={styles.heroCopy}>
            <div className={styles.eyebrow}>Built for systematic traders</div>
            <h1 className={styles.heroTitle}>Your trades show the outcome. alphavyuh shows the pattern.</h1>
            <p className={styles.heroSubhead}>
              alphavyuh is the AI-powered trading journal for systematic traders running SEPA, VCP,
              and momentum setups on NSE and BSE. It tracks whether you followed your own process,
              then shows what is actually working in your journal.
            </p>
            <div className={styles.heroActions}>
              <Link href="/signup" className={styles.primaryCta}>
                Start free trial
              </Link>
              <a href="#product" className={styles.secondaryCta}>
                See the product tour
              </a>
            </div>
            <div className={styles.trustLine}>No credit card. Cancel anytime.</div>
          </LandingReveal>

          <LandingReveal className={styles.heroSurface} delay={0.08}>
            <div className={styles.heroSurfaceHeader}>
              <div>
                <div className={styles.heroSurfaceTitle}>Live process-first chart desk</div>
                <div className={styles.heroSurfaceMeta}>
                  {region === "IN" ? "NSE spotlight" : "US spotlight"} · 1 day · 5 minute bars
                </div>
              </div>
            </div>
            <HeroChart symbol={heroSymbol} initialData={history} />
          </LandingReveal>
        </section>

        <LandingReveal className={styles.section}>
          <div className={styles.sectionLabel}>Live market context</div>
          <h2 className={styles.sectionTitle}>Stay close to the tape without leaving the journal wedge.</h2>
          <p className={styles.sectionCopy}>
            Use live indices and movers as context, then step back into the one question that compounds:
            which setups actually work when you trade them, not when someone else screenshots them.
          </p>
          <MarketMovers region={region} initialData={movers} />
        </LandingReveal>

        <LandingReveal className={styles.section}>
          <div className={styles.sectionLabel}>The difference</div>
          <h2 className={styles.sectionTitle}>Charts show the move. alphavyuh shows the mistake.</h2>
          <p className={styles.sectionCopy}>
            The chart can tell you where price went. It cannot tell you whether you took a low-quality
            breakout again, ignored your own VCP checklist, or keep forcing setups that your own journal
            already disproved.
          </p>
          <div className={styles.differenceCardGrid}>
            <div className={styles.differenceCard}>
              <div className={styles.differenceIcon}>01</div>
              <h3>Every trade, tagged to your setup</h3>
              <p>
                Keep SEPA, VCP, breakout, pullback, and momentum trades organized by the actual setup
                you were trying to execute, not by vague notes after the fact.
              </p>
            </div>
            <div className={styles.differenceCard}>
              <div className={styles.differenceIcon}>02</div>
              <h3>AI pattern detection</h3>
              <p>
                Based on your last <CountUpValue value={50} suffix=" trades" />, alphavyuh can surface where
                one setup family is outperforming another and where your edge is leaking.
              </p>
            </div>
            <div className={styles.differenceCard}>
              <div className={styles.differenceIcon}>03</div>
              <h3>Setup adherence scoring</h3>
              <p>
                Define your own trade rules, score each trade against them, and see whether discipline is
                actually the variable holding your equity curve back.
              </p>
            </div>
          </div>
        </LandingReveal>

        <LandingReveal className={styles.section} delay={0.04}>
          <div id="product" className={styles.sectionLabel}>Inside alphavyuh</div>
          <h2 className={styles.sectionTitle}>The journal that learns from your trades.</h2>
          <p className={styles.sectionCopy}>
            The product surface is built to connect broker imports, setup tagging, trade review, and AI
            observations into one journal workflow that gets sharper as your sample size grows.
          </p>
          <div className={styles.demoWrap}>
            <div className={styles.demoMock}>
              <div className={styles.demoSidebar}>
                <div className={styles.demoSidebarBlock} />
                <div className={styles.demoSidebarBlock} />
                <div className={styles.demoSidebarBlock} />
              </div>
              <div className={styles.demoMain}>
                <div className={styles.demoToolbar} />
                <div className={styles.demoInsightGrid}>
                  <div className={styles.demoInsightCard} />
                  <div className={styles.demoInsightCard} />
                  <div className={styles.demoInsightCard} />
                </div>
                <div className={styles.demoChartCard} />
                <div className={styles.demoTable} />
              </div>
            </div>
            <div className={`${styles.demoAnnotation} ${styles.annotationOne}`}>
              <strong>AI review summary</strong>
              <span>Highlights which setup families are compounding and which ones are diluting your process.</span>
            </div>
            <div className={`${styles.demoAnnotation} ${styles.annotationTwo}`}>
              <strong>Trade-by-trade rule scoring</strong>
              <span>Turns vague discipline into a measurable adherence score you can review weekly.</span>
            </div>
            <div className={`${styles.demoAnnotation} ${styles.annotationThree}`}>
              <strong>Setup-linked history</strong>
              <span>Every imported trade stays attached to the setup and review context that produced it.</span>
            </div>
          </div>
        </LandingReveal>

        <LandingReveal className={styles.section}>
          <div className={styles.sectionLabel}>How it works</div>
          <h2 className={styles.sectionTitle}>Build the review loop into your normal workflow.</h2>
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <h3>Connect your broker</h3>
              <p>Zerodha Kite is the first broker integration, with more broker connectivity planned after launch.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <h3>Trade normally</h3>
              <p>alphavyuh captures journal context around your trades so setup tagging and review stay connected.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <h3>Review insights weekly</h3>
              <p>Use AI observations and adherence analysis to see what is working, what is noise, and what keeps repeating.</p>
            </div>
          </div>
        </LandingReveal>

        <LandingReveal className={styles.section}>
          <div id="pricing" className={styles.sectionLabel}>Pricing</div>
          <h2 className={styles.sectionTitle}>One plan. Full access.</h2>
          <div className={styles.pricingWrap}>
            <div className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <div className={styles.pricingPlan}>Pro</div>
                <div className={styles.sectionLabel}>14-day free trial</div>
              </div>
              <div className={styles.pricingValue}>
                ₹<CountUpValue value={100} />
                <small>/month</small>
              </div>
              <ul className={styles.pricingList}>
                <li>Broker-linked trade journal</li>
                <li>Setup tagging for systematic workflows</li>
                <li>AI trade pattern detection</li>
                <li>Setup adherence scoring</li>
                <li>Weekly review workflow</li>
                <li>Journal insights dashboard</li>
                <li>All features included</li>
              </ul>
              <Link href="/signup" className={styles.primaryCta}>
                Start 14-day free trial
              </Link>
              <div className={styles.pricingFoot}>All features included. Cancel anytime.</div>
            </div>
          </div>
        </LandingReveal>
      </div>

      <footer id="resources" className={styles.footer}>
        <div className={styles.shell}>
          <div className={styles.footerGrid}>
            <div className={styles.footerColumn}>
              <h4>Product</h4>
              <a href="#product">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#product">Changelog</a>
            </div>
            <div className={styles.footerColumn}>
              <h4>Resources</h4>
              <a href="#resources">Docs</a>
              <a href="#resources">Blog</a>
              <a href="#resources">Guides</a>
            </div>
            <div className={styles.footerColumn}>
              <h4>Company</h4>
              <a href="#product">About</a>
              <a href="mailto:hello@alphavyuh.com">Contact</a>
              <a href="#resources">Careers</a>
            </div>
            <div className={styles.footerColumn}>
              <h4>Legal</h4>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <a href="#resources">Disclaimer</a>
            </div>
          </div>

          <div className={styles.footerLegal}>
            <div>alphavyuh © {new Date().getFullYear()} · Made in India</div>
            <div className={styles.disclaimer}>
              alphavyuh is a trading journal and analytics platform. We do not provide investment advice.
              Past performance does not guarantee future results.
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
