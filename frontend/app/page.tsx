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
  title: "alphavyuh — Scanner, Charts, Broker Trading, and AI Trade Review",
  description:
    "Scan, chart, trade, journal, and review in one trading workspace. Built for NSE/BSE systematic traders who want broker execution and AI post-trade analysis in one loop.",
  metadataBase: new URL("https://alphavyuh.com"),
  openGraph: {
    title: "alphavyuh — Scanner, Charts, Broker Trading, and AI Trade Review",
    description:
      "Scan, chart, trade, journal, and review in one trading workspace. Built for NSE/BSE systematic traders who want broker execution and AI post-trade analysis in one loop.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "alphavyuh — Scanner, Charts, Broker Trading, and AI Trade Review",
    description:
      "Scan, chart, trade, journal, and review in one trading workspace. Built for NSE/BSE systematic traders who want broker execution and AI post-trade analysis in one loop.",
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
      "Trading workspace for systematic traders with scanner, charting, broker execution, journaling, and AI post-trade analysis.",
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
            <h1 className={styles.heroTitle}>Scan, trade, and review in one loop.</h1>
            <p className={styles.heroSubhead}>
              alphavyuh brings together screening, chart analysis, broker-linked execution,
              journaling, and AI post-trade review for systematic traders running SEPA, VCP,
              momentum, and breakout workflows on NSE and BSE.
            </p>
            <div className={styles.heroFeatureRow}>
              <span>Scanner + watchlists</span>
              <span>TradingView-style charts</span>
              <span>Broker execution</span>
              <span>AI review</span>
            </div>
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
          <h2 className={styles.sectionTitle}>Stay close to the tape without leaving the workflow.</h2>
          <p className={styles.sectionCopy}>
            Track the live market, shortlist the names that matter, move into charts, and carry the same
            symbols all the way through broker execution and post-trade review.
          </p>
          <MarketMovers region={region} initialData={movers} />
        </LandingReveal>

        <LandingReveal className={styles.section}>
          <div className={styles.sectionLabel}>The difference</div>
          <h2 className={styles.sectionTitle}>Most tools stop at the trade. alphavyuh closes the loop.</h2>
          <p className={styles.sectionCopy}>
            A screener finds symbols. A chart shows price. A broker fills the order. alphavyuh ties those
            pieces together, then shows what your execution and decision-making actually look like after the trade.
          </p>
          <div className={styles.differenceCardGrid}>
            <div className={styles.differenceCard}>
              <div className={styles.differenceIcon}>01</div>
              <h3>From scanner to execution</h3>
              <p>
                Screen the market, add names to watchlists, open charts fast, and place the trade from
                the same workflow instead of stitching together five separate tools.
              </p>
            </div>
            <div className={styles.differenceCard}>
              <div className={styles.differenceIcon}>02</div>
              <h3>Broker-linked trade capture</h3>
              <p>
                Orders and fills stay tied to the setup, chart context, and review notes that produced
                them, so your journal is built automatically instead of after memory fades.
              </p>
            </div>
            <div className={styles.differenceCard}>
              <div className={styles.differenceIcon}>03</div>
              <h3>AI post-trade analysis</h3>
              <p>
                Based on your last <CountUpValue value={50} suffix=" trades" />, alphavyuh can surface
                which setups pay, where adherence breaks, and what mistakes keep repeating.
              </p>
            </div>
          </div>
        </LandingReveal>

        <LandingReveal className={styles.section} delay={0.04}>
          <div id="product" className={styles.sectionLabel}>Inside alphavyuh</div>
          <h2 className={styles.sectionTitle}>The trading workspace that learns from your trades.</h2>
          <p className={styles.sectionCopy}>
            alphavyuh is built as one loop: scan, shortlist, analyze, execute, record, and review. The
            journal is not a dead log at the end. It becomes the system that sharpens every decision after it.
          </p>
          <div className={styles.demoWrap}>
            <div className={styles.demoMock}>
              <div className={styles.demoSidebar}>
                <div className={styles.demoSidebarHeader}>Workspace</div>
                <div className={styles.demoSidebarBlock}>
                  <span>Scanner</span>
                  <strong>Momentum + VCP</strong>
                </div>
                <div className={styles.demoSidebarBlock}>
                  <span>Watchlist</span>
                  <strong>RELIANCE, TCS, ICICIBANK</strong>
                </div>
                <div className={styles.demoSidebarBlock}>
                  <span>Broker</span>
                  <strong>Zerodha Kite linked</strong>
                </div>
              </div>
              <div className={styles.demoMain}>
                <div className={styles.demoToolbar}>
                  <div className={styles.demoToolbarTitle}>
                    <strong>AI review desk</strong>
                    <span>Week 17 · 24 closed trades · 82% rule adherence</span>
                  </div>
                  <div className={styles.demoToolbarBadge}>Process improving</div>
                </div>
                <div className={styles.demoInsightGrid}>
                  <div className={styles.demoInsightCard}>
                    <span>Best setup</span>
                    <strong>VCP continuation</strong>
                    <p>+4.8R avg over the last 8 trades.</p>
                  </div>
                  <div className={styles.demoInsightCard}>
                    <span>Leak</span>
                    <strong>Late breakout entries</strong>
                    <p>Win rate drops 19% when you chase after the trigger candle.</p>
                  </div>
                  <div className={styles.demoInsightCard}>
                    <span>Execution</span>
                    <strong>Stops respected</strong>
                    <p>Risk containment improved across the last 3 weeks.</p>
                  </div>
                </div>
                <div className={styles.demoChartCard}>
                  <div className={styles.demoChartHeader}>
                    <span>RELIANCE · 15m</span>
                    <span>Trade linked to journal review</span>
                  </div>
                  <div className={styles.demoChartGraphic}>
                    <div className={styles.demoChartArea} />
                    <div className={styles.demoChartMarkerLong}>Entry</div>
                    <div className={styles.demoChartMarkerStop}>Stop</div>
                    <div className={styles.demoChartMarkerTarget}>Target</div>
                  </div>
                </div>
                <div className={styles.demoTable}>
                  <div className={styles.demoTableHeader}>
                    <span>Recent reviewed trades</span>
                    <span>Score</span>
                  </div>
                  <div className={styles.demoTableRow}>
                    <span>RELIANCE · VCP continuation</span>
                    <strong>92</strong>
                  </div>
                  <div className={styles.demoTableRow}>
                    <span>ICICIBANK · Pullback entry</span>
                    <strong>84</strong>
                  </div>
                  <div className={styles.demoTableRow}>
                    <span>TCS · Breakout chase</span>
                    <strong className={styles.demoTableNegative}>61</strong>
                  </div>
                </div>
              </div>
            </div>
            <div className={`${styles.demoAnnotation} ${styles.annotationOne}`}>
              <strong>AI review summary</strong>
              <span>Highlights which setup families are compounding and which ones are diluting your process.</span>
            </div>
            <div className={`${styles.demoAnnotation} ${styles.annotationTwo}`}>
              <strong>Broker-linked execution trail</strong>
              <span>Trades stay tied to the actual chart and setup context that created them.</span>
            </div>
            <div className={`${styles.demoAnnotation} ${styles.annotationThree}`}>
              <strong>Trade-by-trade rule scoring</strong>
              <span>Turns vague discipline into a measurable adherence score you can review weekly.</span>
            </div>
          </div>
        </LandingReveal>

        <LandingReveal className={styles.section}>
          <div className={styles.sectionLabel}>How it works</div>
          <h2 className={styles.sectionTitle}>Build the review loop into your normal workflow.</h2>
          <div className={styles.stepsGrid}>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>1</div>
              <h3>Scan and shortlist</h3>
              <p>Run scans, screen the market, and move the best names into watchlists without leaving the platform.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>2</div>
              <h3>Analyze and execute</h3>
              <p>Work from the chart, use broker integration for execution, and keep the trade tied to setup and context.</p>
            </div>
            <div className={styles.stepCard}>
              <div className={styles.stepNumber}>3</div>
              <h3>Review what actually happened</h3>
              <p>Let the journal and AI analysis show which decisions are compounding and which habits need to go.</p>
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
                <li>Scanner and watchlist workflow</li>
                <li>Chart analysis workspace</li>
                <li>Broker-linked trade capture</li>
                <li>Setup tagging and rule scoring</li>
                <li>AI trade pattern detection</li>
                <li>Post-trade review dashboard</li>
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
