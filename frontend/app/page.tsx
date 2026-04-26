"use client";

import Link from "next/link";
import TraderReminderStrip from "@/components/TraderReminderStrip";

const LANDING_CSS = `
.av-landing {
  min-height: 100vh;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 12% 0%, rgba(244,247,251,0.14), transparent 28%),
    radial-gradient(circle at 92% 8%, rgba(90,139,232,0.16), transparent 22%),
    linear-gradient(180deg, #05090c 0%, #081116 42%, #09141a 100%);
}
.av-shell {
  width: min(1240px, calc(100% - 40px));
  margin: 0 auto;
}
.av-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  backdrop-filter: blur(18px);
  background: linear-gradient(180deg, rgba(5,9,12,0.88), rgba(5,9,12,0.58));
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.av-nav-inner {
  height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.av-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.av-brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, var(--accent-strong), var(--accent));
  color: #03110d;
  box-shadow: 0 12px 30px rgba(244,247,251,0.24);
}
.av-nav-links {
  display: flex;
  align-items: center;
  gap: 24px;
  color: var(--text-secondary);
  font-size: 13px;
}
.av-nav-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.av-btn,
.av-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  transition: transform .18s ease, border-color .18s ease, background .18s ease;
}
.av-btn:hover,
.av-btn-secondary:hover {
  transform: translateY(-1px);
}
.av-btn {
  color: #04120d;
  background: linear-gradient(180deg, var(--accent-strong), var(--accent));
  border: 1px solid rgba(244,247,251,0.22);
  box-shadow: 0 18px 40px rgba(244,247,251,0.18);
}
.av-btn-secondary {
  color: var(--text-primary);
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
}
.av-hero {
  padding: 64px 0 38px;
}
.av-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(420px, 0.9fr);
  gap: 28px;
  align-items: stretch;
}
.av-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(244,247,251,0.22);
  background: rgba(244,247,251,0.08);
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.av-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 8px rgba(244,247,251,0.12);
}
.av-h1 {
  margin-top: 22px;
  font-size: clamp(52px, 7vw, 88px);
  line-height: 0.92;
  letter-spacing: -0.07em;
  max-width: 760px;
}
.av-gradient {
  background: linear-gradient(180deg, #ffffff 0%, #d8fef6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.av-sub {
  margin-top: 18px;
  max-width: 670px;
  font-size: 17px;
  line-height: 1.75;
  color: var(--text-secondary);
}
.av-cta-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 28px;
}
.av-proof {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}
.av-proof-chip {
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  font-size: 12px;
  color: var(--text-secondary);
}
.av-panel,
.av-section-card {
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
  box-shadow: var(--shadow-panel);
}
.av-panel {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.av-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.av-panel-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.av-panel-badge {
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  font-size: 11px;
  color: var(--text-secondary);
}
.av-window {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(5,9,12,0.54);
}
.av-window-grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
}
.av-watchlist {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.av-watch-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 12px 13px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.025);
}
.av-watch-item.active {
  border-color: rgba(244,247,251,0.24);
  background: linear-gradient(90deg, rgba(244,247,251,0.12), rgba(255,255,255,0.025));
}
.av-symbol {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.av-symbol-sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.av-chart {
  min-height: 320px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.06);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)),
    radial-gradient(circle at top, rgba(244,247,251,0.08), transparent 38%);
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.av-chart-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.av-chart-title {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
}
.av-chart-price {
  font-size: 12px;
  color: var(--text-secondary);
}
.av-chart-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.av-chip {
  padding: 6px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  font-size: 11px;
  color: var(--text-secondary);
}
.av-chart-svg {
  width: 100%;
  height: 180px;
}
.av-stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.av-chart-lower {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 12px;
  align-items: stretch;
}
.av-review-card {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.av-review-list {
  display: grid;
  gap: 8px;
}
.av-review-item {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.025);
}
.av-review-item strong {
  display: block;
  font-size: 12px;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.av-review-item span {
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.av-stat {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.av-stat .label {
  margin-bottom: 6px;
}
.av-stat-value {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
}
.av-sections {
  padding: 18px 0 72px;
  display: grid;
  gap: 18px;
}
.av-section-card {
  padding: 24px;
}
.av-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.av-section-title {
  font-size: clamp(26px, 4vw, 40px);
  line-height: 1;
  letter-spacing: -0.05em;
}
.av-section-copy {
  max-width: 640px;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.72;
  color: var(--text-secondary);
}
.av-three {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.av-feature {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.av-feature h3 {
  font-size: 17px;
  margin-bottom: 10px;
}
.av-feature p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.av-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.av-step {
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.av-step-num {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  background: rgba(244,247,251,0.14);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
}
.av-step-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 8px;
}
.av-step-copy {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.av-grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.av-outcome {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(244,247,251,0.06), rgba(255,255,255,0.02));
}
.av-outcome-value {
  font-size: clamp(26px, 4vw, 42px);
  line-height: 1;
  letter-spacing: -0.05em;
}
.av-footer-cta {
  margin-top: 10px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}
.av-band {
  margin-top: 18px;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
  box-shadow: var(--shadow-panel);
}
.av-band-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.av-band-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}
.av-band-card h3 {
  font-size: 15px;
  margin-bottom: 8px;
}
.av-band-card p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.av-mini-grid {
  padding: 8px 0 28px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.av-mini-card {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
  box-shadow: var(--shadow-panel);
}
.av-mini-card h3 {
  font-size: 16px;
  margin-bottom: 8px;
}
.av-mini-card p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
@media (max-width: 1080px) {
  .av-hero-grid,
  .av-window-grid,
  .av-grid-two,
  .av-three,
  .av-steps,
  .av-chart-lower,
  .av-band-grid,
  .av-mini-grid {
    grid-template-columns: 1fr;
  }
  .av-stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .av-nav-links {
    display: none;
  }
}
@media (max-width: 720px) {
  .av-shell {
    width: min(100% - 24px, 1240px);
  }
  .av-nav-inner {
    height: auto;
    padding: 14px 0;
    align-items: flex-start;
  }
  .av-nav-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .av-hero {
    padding-top: 38px;
  }
  .av-h1 {
    font-size: clamp(40px, 14vw, 62px);
  }
  .av-stat-row {
    grid-template-columns: 1fr;
  }
}
`;

export default function LandingPage() {
  const year = new Date().getFullYear();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="av-landing">
        <nav className="av-nav">
          <div className="av-shell av-nav-inner">
            <Link href="/" className="av-brand">
              <span className="av-brand-mark">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2 13.5L6 8.5L9.5 11.25L14.25 4.5L16 6.25" stroke="#04120d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              AlphaVyuh
            </Link>
            <div className="av-nav-links">
              <a href="#platform">Platform</a>
              <a href="#workflow">Workflow</a>
              <a href="#edge">Why it wins</a>
              <a href="#launch">Launch</a>
            </div>
            <div className="av-nav-actions">
              <Link href="/login" className="av-btn-secondary">Sign in</Link>
              <Link href="/signup" className="av-btn">Start free</Link>
            </div>
          </div>
        </nav>

        <main className="av-shell">
          <section className="av-hero">
            <div className="av-hero-grid">
              <div>
                <div className="av-kicker">
                  <span className="av-dot" />
                  Built for Indian market workflows
                </div>
                <h1 className="av-h1">
                  <span className="av-gradient">Scan.</span> Focus. Execute. Improve.
                </h1>
                <p className="av-sub">
                  AlphaVyuh brings scanner, watchlist, charting, trade execution, journaling, and post-trade review
                  into one trading operating system so serious retail traders stop leaking edge between tools.
                </p>
                <div className="av-cta-row">
                  <Link href="/signup" className="av-btn">Open the platform →</Link>
                  <a href="#workflow" className="av-btn-secondary">See the full loop</a>
                </div>
                <div className="av-proof">
                  <div className="av-proof-chip">Built around the real trading loop, not disconnected widgets.</div>
                  <div className="av-proof-chip">Scanner, watchlist, chart, execution, and journal stay connected.</div>
                  <div className="av-proof-chip">Structured for NSE/BSE swing, positional, and process-driven retail workflows.</div>
                </div>
                <TraderReminderStrip tone="landing" />
              </div>

              <div className="av-panel">
                <div className="av-panel-head">
                  <div className="av-panel-title">Workflow Preview</div>
                  <div className="av-panel-badge">Illustrative marketwatch + chart + journal loop</div>
                </div>
                <div className="av-window">
                  <div className="av-window-grid">
                    <div className="av-watchlist">
                      <div className="av-watch-item active">
                        <div>
                          <div className="av-symbol">RELIANCE</div>
                          <div className="av-symbol-sub">Focus symbol · chart linked</div>
                        </div>
                        <div className="mono num-negative">-1.16%</div>
                      </div>
                      <div className="av-watch-item">
                        <div>
                          <div className="av-symbol">TCS</div>
                          <div className="av-symbol-sub">Watchlist candidate</div>
                        </div>
                        <div className="mono num-negative">-4.95%</div>
                      </div>
                      <div className="av-watch-item">
                        <div>
                          <div className="av-symbol">DIXON</div>
                          <div className="av-symbol-sub">Breakout scan match</div>
                        </div>
                        <div className="mono num-positive">+3.18%</div>
                      </div>
                    </div>
                    <div className="av-chart">
                      <div className="av-chart-top">
                        <div>
                          <div className="av-chart-title">RELIANCE · Daily</div>
                          <div className="av-chart-price">EMA stack, active levels, execution context, journal handoff</div>
                        </div>
                        <div className="av-chart-actions">
                          <span className="av-chip">Trendline</span>
                          <span className="av-chip">Fib</span>
                          <span className="av-chip">Broker beta</span>
                        </div>
                      </div>
                      <svg className="av-chart-svg" viewBox="0 0 520 180" fill="none">
                        <defs>
                          <linearGradient id="av-area" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(244,247,251,0.34)" />
                            <stop offset="100%" stopColor="rgba(244,247,251,0.02)" />
                          </linearGradient>
                        </defs>
                        <path d="M0 150H520" stroke="rgba(255,255,255,0.08)" />
                        <path d="M0 116H520" stroke="rgba(255,255,255,0.05)" />
                        <path d="M0 82H520" stroke="rgba(255,255,255,0.05)" />
                        <path d="M18 128L80 118L132 122L176 98L228 86L280 92L338 68L392 74L442 58L502 42L502 180L18 180Z" fill="url(#av-area)" />
                        <path d="M18 128L80 118L132 122L176 98L228 86L280 92L338 68L392 74L442 58L502 42" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M86 110L188 110" stroke="rgba(90,139,232,0.8)" strokeWidth="2" strokeDasharray="6 6" />
                        <path d="M300 72L438 72" stroke="rgba(229,56,59,0.9)" strokeWidth="2" />
                      </svg>
                      <div className="av-chart-lower">
                        <div className="av-stat-row">
                          <div className="av-stat">
                            <div className="label">Scan preset</div>
                            <div className="av-stat-value">Leaders</div>
                          </div>
                          <div className="av-stat">
                            <div className="label">Trade state</div>
                            <div className="av-stat-value">Ready</div>
                          </div>
                          <div className="av-stat">
                            <div className="label">Journal link</div>
                            <div className="av-stat-value">Auto</div>
                          </div>
                          <div className="av-stat">
                            <div className="label">Review pulse</div>
                            <div className="av-stat-value">Visible</div>
                          </div>
                        </div>
                        <div className="av-review-card">
                          <div className="label" style={{ color: "var(--accent)" }}>Post-trade review</div>
                          <div className="av-review-list">
                            <div className="av-review-item">
                              <strong>Trade plan stayed attached to context</strong>
                              <span>The setup, chart markings, and trade record can stay linked instead of splitting across tools.</span>
                            </div>
                            <div className="av-review-item">
                              <strong>Review becomes part of the workflow</strong>
                              <span>Closed trades can move straight into post-trade analysis so learning stops being optional.</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="av-mini-grid" id="workflow">
            <div className="av-mini-card">
              <h3>Discover with less noise</h3>
              <p>Run a clean scan, sort quickly, and move only the names worth chart time.</p>
            </div>
            <div className="av-mini-card">
              <h3>Work from one active desk</h3>
              <p>Watchlist, chart, and trade planning stay linked so the setup never loses context.</p>
            </div>
            <div className="av-mini-card">
              <h3>Review without friction</h3>
              <p>Journal and post-trade learning stay attached to execution instead of being skipped.</p>
            </div>
          </section>

          <section className="av-footer-cta" id="launch">
            <div>
              <div className="label" style={{ color: "var(--accent)", marginBottom: 10 }}>Workflow</div>
              <div className="av-section-title" style={{ fontSize: "clamp(24px, 4vw, 38px)" }}>
                Built for scan to watchlist to chart to review.
              </div>
              <div className="av-section-copy" style={{ maxWidth: 620 }}>
                Open the platform, build a shortlist fast, and keep the full decision chain inside one connected product.
              </div>
            </div>
            <div className="av-nav-actions">
              <Link href="/login" className="av-btn-secondary">Sign in</Link>
              <Link href="/signup" className="av-btn">Start free →</Link>
            </div>
          </section>
        </main>

        <footer className="av-shell" style={{ paddingBottom: 32, color: "var(--text-tertiary)", fontSize: 12 }}>
          AlphaVyuh © {year}. Trading workflow software for serious retail market participants.
        </footer>
      </div>
    </>
  );
}
