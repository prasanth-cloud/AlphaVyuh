"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TRADER_WORKFLOW_STEPS } from "@/lib/workflow-placement";

export default function LandingPage() {
  const scanRowsRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const chartLineRef = useRef<SVGPathElement>(null);
  const chartAreaRef = useRef<SVGPathElement>(null);
  const chartRsRef = useRef<SVGPathElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("alphavyuh-theme") === "light" ? "light" : "dark";
    setTheme(stored);
    document.documentElement.dataset.theme = stored;

    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<"dark" | "light">).detail ?? document.documentElement.dataset.theme;
      setTheme(next === "light" ? "light" : "dark");
    };

    window.addEventListener("alphavyuh:theme-changed", syncTheme);
    return () => window.removeEventListener("alphavyuh:theme-changed", syncTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("alphavyuh-theme", nextTheme);
    window.dispatchEvent(new CustomEvent("alphavyuh:theme-changed", { detail: nextTheme }));
  }

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // Nav scroll
    const nav = document.getElementById("lp-nav");
    const onScroll = () => nav?.classList.toggle("lp-scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });

    // Scan rows
    const scanData = [
      { sym: "DEEPAKNTR", sub: "Chemicals", tag: "VCP", tagCls: "lp-tag-teal", price: "₹2,847", rs: 94 },
      { sym: "DIXON", sub: "Electronics", tag: "Breakout", tagCls: "lp-tag-green", price: "₹14,220", rs: 91 },
      { sym: "PERSISTENT", sub: "IT Services", tag: "Stage 2", tagCls: "lp-tag-purple", price: "₹4,956", rs: 88 },
      { sym: "KPIGREEN", sub: "Renewables", tag: "VCP", tagCls: "lp-tag-teal", price: "₹892", rs: 85 },
      { sym: "CAMS", sub: "BFSI", tag: "Pullback", tagCls: "lp-tag-yellow", price: "₹3,412", rs: 83 },
    ];
    const rc = scanRowsRef.current;
    if (rc) {
      rc.innerHTML = "";
      scanData.forEach((d, i) => {
        const row = document.createElement("div");
        row.className = "lp-srow";
        row.style.animationDelay = (i * 0.06) + "s";
        row.innerHTML = `<div><div class="lp-sym">${d.sym}</div><div class="lp-sym-sub">${d.sub}</div></div><div><span class="lp-tag ${d.tagCls}">${d.tag}</span></div><div class="lp-pval">${d.price}</div><div class="lp-rs-mini"><div class="lp-rs-track"><div class="lp-rs-fill" style="width:${d.rs}%"></div></div><span class="lp-rs-num">${d.rs}</span></div>`;
        rc.appendChild(row);
      });
    }

    // Ticker tape
    const tickers = [
      { sym: "NIFTY50", price: "22,147", chg: "+0.82%", pos: true },
      { sym: "SENSEX", price: "73,158", chg: "+0.74%", pos: true },
      { sym: "RELIANCE", price: "2,891", chg: "+1.24%", pos: true },
      { sym: "INFY", price: "1,634", chg: "-0.38%", pos: false },
      { sym: "TCS", price: "3,824", chg: "+0.55%", pos: true },
      { sym: "DEEPAKNTR", price: "2,847", chg: "+4.72%", pos: true },
      { sym: "DIXON", price: "14,220", chg: "+3.18%", pos: true },
      { sym: "ICICIBANK", price: "1,248", chg: "+1.14%", pos: true },
      { sym: "SBIN", price: "786", chg: "-0.22%", pos: false },
      { sym: "PERSISTENT", price: "4,956", chg: "+2.84%", pos: true },
      { sym: "BAJFINANCE", price: "7,240", chg: "-0.55%", pos: false },
      { sym: "MARUTI", price: "12,640", chg: "+0.33%", pos: true },
      { sym: "CAMS", price: "3,412", chg: "+2.31%", pos: true },
      { sym: "BANKNIFTY", price: "47,820", chg: "+0.62%", pos: true },
    ];
    const tape = tapeRef.current;
    if (tape) {
      tape.innerHTML = "";
      [...tickers, ...tickers].forEach(t => {
        const el = document.createElement("div");
        el.className = "lp-tape-item";
        el.innerHTML = `<span class="lp-tape-sym">${t.sym}</span><span class="lp-tape-price">${t.price}</span><span class="${t.pos ? "lp-tape-pos" : "lp-tape-neg"}">${t.chg}</span>`;
        tape.appendChild(el);
      });
    }

    // Counter animation
    function animateCounter(el: HTMLElement) {
      const target = +(el.dataset.target || 0);
      const suffix = el.dataset.suffix || "";
      const dur = 900, start = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const val = Math.round(ease * target);
        el.textContent = (val >= 1000 ? val.toLocaleString("en-IN") : val) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    // IntersectionObserver
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).classList.add("lp-visible");
          const t = e.target as HTMLElement;
          if (t.dataset.target) animateCounter(t);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll(".lp-fade,.lp-step,.lp-tcard,.lp-pcard,.lp-af-item,[data-target]").forEach(el => io.observe(el));

    // Chart SVG
    const pts = [8,72,58,80,50,68,45,62,55,50,42,60,35,52,40,45,38,55,30,48,36,42,28,50,22,40,30,35,20,45,15,38,25,30,18,42,10,35,16,28,12,38,8,30];
    const h = 160, w = 400;
    let pd = "", ad = "";
    for (let i = 0; i < pts.length; i += 2) {
      const x = (pts[i] / 44) * w, y = h - (pts[i + 1] / 100) * h * 0.85 - 10;
      pd += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
      ad += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    }
    ad += `L${w},${h}L0,${h}Z`;
    const rsPts = [0,35,50,40,100,45,150,38,200,48,250,42,300,50,350,44,400,52];
    let rd = "";
    for (let i = 0; i < rsPts.length; i += 2) {
      const x = rsPts[i], y = h - (rsPts[i + 1] / 100) * h * 0.7 - 10;
      rd += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    }
    if (chartLineRef.current && chartAreaRef.current && chartRsRef.current) {
      chartLineRef.current.setAttribute("d", pd);
      chartAreaRef.current.setAttribute("d", ad);
      chartRsRef.current.setAttribute("d", rd);
      const len = chartLineRef.current.getTotalLength();
      chartLineRef.current.style.strokeDasharray = String(len);
      chartLineRef.current.style.strokeDashoffset = String(len);
      chartLineRef.current.style.transition = "stroke-dashoffset 2s ease";
      setTimeout(() => { if (chartLineRef.current) chartLineRef.current.style.strokeDashoffset = "0"; }, 400);
    }

    // Tabs
    const tabsHeader = document.getElementById("lp-tabs-header");
    const onTabClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest(".lp-tab-btn") as HTMLElement;
      if (!btn) return;
      document.querySelectorAll(".lp-tab-btn").forEach(b => b.classList.remove("lp-tab-active"));
      document.querySelectorAll(".lp-tab-panel").forEach(p => p.classList.remove("lp-tab-active"));
      btn.classList.add("lp-tab-active");
      const panel = document.getElementById("lp-tab-" + btn.dataset.tab);
      if (panel) panel.classList.add("lp-tab-active");
    };
    tabsHeader?.addEventListener("click", onTabClick);
    if (tabsHeader) cleanups.push(() => tabsHeader.removeEventListener("click", onTabClick));

    // FAQ
    document.querySelectorAll(".lp-faq-q").forEach(q => {
      const onFaqClick = () => {
        const item = (q as HTMLElement).parentElement!;
        const wasOpen = item.classList.contains("lp-faq-open");
        document.querySelectorAll(".lp-faq-item").forEach(i => i.classList.remove("lp-faq-open"));
        if (!wasOpen) item.classList.add("lp-faq-open");
      };
      q.addEventListener("click", onFaqClick);
      cleanups.push(() => q.removeEventListener("click", onFaqClick));
    });

    // Pricing toggle
    const ptToggle = document.getElementById("lp-billing") as HTMLInputElement;
    const ptM = document.getElementById("lp-ptm");
    const ptA = document.getElementById("lp-pta");
    const onPricingToggle = () => {
      const annual = ptToggle.checked;
      ptM?.classList.toggle("lp-pt-active", !annual);
      ptA?.classList.toggle("lp-pt-active", annual);
      const pPro = document.getElementById("lp-p-pro");
      const pElite = document.getElementById("lp-p-elite");
      const pProOld = document.getElementById("lp-p-pro-old");
      const pEliteOld = document.getElementById("lp-p-elite-old");
      if (pPro) pPro.textContent = annual ? "499" : "599";
      if (pElite) pElite.textContent = annual ? "3,499" : "4,999";
      if (pProOld) pProOld.style.display = annual ? "" : "none";
      if (pEliteOld) pEliteOld.style.display = annual ? "" : "none";
    };
    ptToggle?.addEventListener("change", onPricingToggle);
    if (ptToggle) cleanups.push(() => ptToggle.removeEventListener("change", onPricingToggle));

    // 3D tilt
    document.querySelectorAll(".lp-tilt").forEach(card => {
      const onTiltMove = (ev: Event) => {
        const e = ev as MouseEvent;
        const r = (card as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * 14;
        const y = ((e.clientY - r.top) / r.height - 0.5) * -14;
        (card as HTMLElement).style.transform = `perspective(600px) rotateY(${x}deg) rotateX(${y}deg) scale(1.02)`;
      };
      const onTiltLeave = () => {
        (card as HTMLElement).style.transform = "perspective(600px) rotateX(0) rotateY(0) scale(1)";
      };
      card.addEventListener("mousemove", onTiltMove);
      card.addEventListener("mouseleave", onTiltLeave);
      cleanups.push(() => {
        card.removeEventListener("mousemove", onTiltMove);
        card.removeEventListener("mouseleave", onTiltLeave);
      });
    });

    // Row refresh
    const extraData = [
      { sym: "TATAELXSI", sub: "IT Design", tag: "VCP", tagCls: "lp-tag-teal", price: "₹6,824", rs: 89 },
      { sym: "CLEAN SCI", sub: "Chemicals", tag: "Breakout", tagCls: "lp-tag-green", price: "₹1,644", rs: 87 },
      { sym: "AFFLE", sub: "Adtech", tag: "Stage 2", tagCls: "lp-tag-purple", price: "₹1,318", rs: 86 },
    ];
    let extIdx = 0;
    const rowInterval = setInterval(() => {
      const rows = rc?.querySelectorAll(".lp-srow");
      if (!rows || rows.length === 0) return;
      const target = rows[Math.floor(Math.random() * rows.length)] as HTMLElement;
      const d = extraData[extIdx % extraData.length]; extIdx++;
      target.style.opacity = "0"; target.style.transform = "translateX(-12px)";
      setTimeout(() => {
        target.innerHTML = `<div><div class="lp-sym">${d.sym}</div><div class="lp-sym-sub">${d.sub}</div></div><div><span class="lp-tag ${d.tagCls}">${d.tag}</span></div><div class="lp-pval">${d.price}</div><div class="lp-rs-mini"><div class="lp-rs-track"><div class="lp-rs-fill" style="width:${d.rs}%"></div></div><span class="lp-rs-num">${d.rs}</span></div>`;
        target.style.transition = "opacity .4s ease,transform .4s ease";
        target.style.opacity = "1"; target.style.transform = "none";
      }, 300);
    }, 3500);

    // Activity feed pulse
    const afItems = document.querySelectorAll(".lp-af-item");
    let afIdx = 0;
    const afInterval = setInterval(() => {
      afItems.forEach(i => (i as HTMLElement).style.boxShadow = "");
      const el = afItems[afIdx % afItems.length] as HTMLElement;
      if (el) el.style.boxShadow = "0 0 0 1.5px rgba(214,223,232,.2),0 4px 16px rgba(0,0,0,.2)";
      afIdx++;
    }, 2200);

    return () => {
      window.removeEventListener("scroll", onScroll);
      cleanups.forEach(cleanup => cleanup());
      clearInterval(rowInterval);
      clearInterval(afInterval);
      io.disconnect();
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* NAV */}
      <nav id="lp-nav">
        <div className="lp-nav-wrap">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-mark">
              <svg viewBox="0 0 18 18" fill="none" width="18" height="18">
                <path d="M2 14L6.5 8L10 11L14.5 4L16 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="16" cy="6" r="1.5" fill="currentColor"/>
              </svg>
            </div>
            AlphaVyuh
          </Link>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-nav-right">
            <button type="button" className="lp-theme-toggle" onClick={toggleTheme}>
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <Link href="/login" className="lp-btn-ghost">Sign in</Link>
            <Link href="/signup" className="lp-btn-cta">Request access →</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="lp-hero">
        <div className="lp-grid-overlay"></div>
        <div className="lp-hero-inner">
          <div className="lp-hero-text">
            <div className="lp-eyebrow">
              <div className="lp-live-pill"><div className="lp-pulse"></div>Account access · EOD market data</div>
            </div>
            <h1 className="lp-h1">
              <span className="lp-h1-s1">A trading workflow journal for Indian swing traders.</span>
            </h1>
            <p className="lp-sub">Scan after market close, keep the reason, plan levels, and review what your closed trades taught you.</p>
            <div className="lp-ctas">
              <Link href="/signup" className="lp-btn-primary">Request access →</Link>
              <a href="#how" className="lp-btn-secondary">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M6 5.5L10.5 8L6 10.5V5.5Z" fill="currentColor"/></svg>
                See workflow
              </a>
            </div>
            <div className="lp-trust-row" aria-label="Product scope">
              <span>EOD market data</span>
              <span>NSE/BSE cash equity</span>
              <span>No trade calls</span>
              <span>Broker import only</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="lp-hero-visual">
            <div className="lp-notif lp-notif1">
              <div className="lp-ni lp-ni-green">RS</div>
              <div className="lp-nt"><strong>VCP Review — DEEPAKNTR</strong><span>Market scan · RS 94 · Vol surge 3.2×</span></div>
            </div>
            <div className="lp-hero-card lp-tilt">
              <div className="lp-card-bar">
                <div className="lp-dot" style={{background:"#FF5F57"}}></div>
                <div className="lp-dot" style={{background:"#FFBD2E"}}></div>
                <div className="lp-dot" style={{background:"#28CA41"}}></div>
                <span className="lp-card-title">Scanner — VCP Momentum · 169 results</span>
              </div>
              <div className="lp-card-body">
                <div className="lp-col-header">
                  <div className="lp-col-h">Stock</div>
                  <div className="lp-col-h">Pattern</div>
                  <div className="lp-col-h">Price</div>
                  <div className="lp-col-h">RS</div>
                </div>
                <div ref={scanRowsRef}></div>
              </div>
            </div>
            <div className="lp-notif lp-notif2">
              <div className="lp-ni lp-ni-teal">JR</div>
              <div className="lp-nt"><strong>Journal review ready</strong><span>3 patterns in your closed trades</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" style={{padding:"88px 0 96px",background:"var(--lp-surface)",borderTop:"1px solid var(--lp-border)",borderBottom:"1px solid var(--lp-border)"}}>
        <div className="lp-wrap" style={{textAlign:"center"}}>
          <span className="lp-sec-label">Daily workflow</span>
          <h2 className="lp-sec-title">One desk flow from open to review.</h2>
          <p className="lp-sec-sub" style={{margin:"0 auto"}}>Dashboard checkpoint → Scanner discovery → Watchlist analysis → Chart planning → Journal review. Every step keeps scan reason, levels, and outcome attached.</p>
          <div className="lp-steps">
            {TRADER_WORKFLOW_STEPS.map((step, index) => (
              <div key={step.title} className="lp-step" style={{transitionDelay:`${index * 0.08}s`}}>
                <div className="lp-step-num">{index + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section id="lp-stats">
        <div className="lp-wrap">
          <div className="lp-stats-grid">
            <div className="lp-stat lp-fade"><div className="lp-stat-num" data-target="4">0</div><div className="lp-stat-label">Workflow surfaces</div><div className="lp-stat-sub">Dashboard, scanner, watchlist, journal</div></div>
            <div className="lp-stat lp-fade" style={{transitionDelay:".1s"}}><div className="lp-stat-num" data-target="5000" data-suffix="+">0</div><div className="lp-stat-label">Symbols tracked</div><div className="lp-stat-sub">latest market snapshot</div></div>
            <div className="lp-stat lp-fade" style={{transitionDelay:".2s"}}><div className="lp-stat-num" data-target="5">0</div><div className="lp-stat-label">Context handoffs</div><div className="lp-stat-sub">reason, price, levels, notes, outcome</div></div>
            <div className="lp-stat lp-fade" style={{transitionDelay:".3s"}}><div className="lp-stat-num" data-target="1">0</div><div className="lp-stat-label">Connected routine</div><div className="lp-stat-sub">from scan to review</div></div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div id="lp-ticker">
        <div className="lp-tape" ref={tapeRef}></div>
      </div>

      {/* FEATURES */}
      <section id="features" style={{padding:"100px 0"}}>
        <div className="lp-wrap">
          <span className="lp-sec-label">Platform</span>
          <h2 className="lp-sec-title" style={{marginBottom:"12px"}}>What you do next at each step</h2>
          <p className="lp-sec-sub" style={{marginBottom:"40px"}}>Scanner discovery, watchlist analysis, chart planning, and journal review — in desk order.</p>
          <div className="lp-tabs-wrap" id="lp-tabs-header">
            {["scanner","watchlist","charts","journal"].map((t,i) => (
              <button key={t} className={"lp-tab-btn"+(i===0?" lp-tab-active":"")} data-tab={t}>
                {t === "charts" ? "Charts" : t.charAt(0).toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>

          {/* Scanner */}
          <div className="lp-tab-panel lp-tab-active" id="lp-tab-scanner">
            <div className="lp-tp-text">
              <span className="lp-feat-label">Scanner</span>
              <h3 className="lp-tp-h">Discovery that keeps the reason</h3>
              <p className="lp-tp-p">Run EOD scans across NSE/BSE equities, then move candidates into review with the original match context attached.</p>
              <ul className="lp-feat-list">
                {["EOD presets for repeatable NSE/BSE routines","Scanner reason, score, and data date stay attached","Relative strength and volume context travel with the symbol","Saved scans can be checked after the next session","Results move into watchlist review without copy-paste"].map(f => (
                  <li key={f} className="lp-fi"><div className="lp-fcheck">✓</div>{f}</li>
                ))}
              </ul>
            </div>
            <div className="lp-tv lp-tilt">
              <div className="lp-tv-bar"><div className="lp-dot" style={{background:"#FF5F57"}}></div><div className="lp-dot" style={{background:"#FFBD2E",marginLeft:6}}></div><div className="lp-dot" style={{background:"#28CA41",marginLeft:6}}></div><span className="lp-card-title">Scanner · NSE EQ · VCP Momentum</span></div>
              <div className="lp-tv-body">
                <div className="lp-filter-bar">
                  <div className="lp-chip lp-chip-on">VCP Preset</div><div className="lp-chip lp-chip-on">NSE EQ</div><div className="lp-chip lp-chip-on">RS &gt; 80</div><div className="lp-chip">+ Add filter</div>
                </div>
                <div className="lp-rcount">Showing <span>169</span> results · sorted by RS Score</div>
                {[["DEEPAKNTR","Chemicals","₹2,847","+4.72%"],["DIXON","Electronics","₹14,220","+3.18%"],["PERSISTENT","IT Services","₹4,956","+2.84%"],["CAMS","BFSI","₹3,412","+2.31%"],["KPIGREEN","Renewables","₹892","+1.97%"]].map(r => (
                  <div key={r[0]} className="lp-sr"><div><div className="lp-sym">{r[0]}</div><div className="lp-sym-sub">{r[1]}</div></div><div className="lp-pval">{r[2]}</div><div className="lp-chg-pos">{r[3]}</div></div>
                ))}
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div className="lp-tab-panel" id="lp-tab-watchlist">
            <div className="lp-tp-text">
              <span className="lp-feat-label">Watchlist</span>
              <h3 className="lp-tp-h">A focused desk for symbols under review</h3>
              <p className="lp-tp-p">Keep scan reason, notes, status, and chart context together before a symbol moves into or out of your routine.</p>
              <ul className="lp-feat-list">
                {["User-owned status labels: watch, ready, tagged, needs review","Notes stay attached to the symbol","Chart preview keeps context visible","Sort by sector, price, volume, and RS","No platform ratings or trade calls"].map(f => (
                  <li key={f} className="lp-fi"><div className="lp-fcheck">✓</div>{f}</li>
                ))}
              </ul>
            </div>
            <div className="lp-tv lp-tilt">
              <div className="lp-tv-bar"><div className="lp-dot" style={{background:"#FF5F57"}}></div><div className="lp-dot" style={{background:"#FFBD2E",marginLeft:6}}></div><span className="lp-card-title">Watchlist · 24 symbols · 4 tagged</span></div>
              <div className="lp-tv-body">
                {[["DEEPAKNTR","Chemicals","Ready"],["DIXON","Electronics","Watch"],["PERSISTENT","IT Services","Tagged"],["CAMS","BFSI","Needs review"]].map(r => (
                  <div key={r[0]} className="lp-jrow"><div><div className="lp-sym">{r[0]}</div><div className="lp-sym-sub">{r[1]}</div></div><div className="lp-ai-tag">{r[2]}</div></div>
                ))}
                <div className="lp-ai-insight">
                  <div className="lp-ai-label">Watchlist note</div>
                  <div className="lp-ai-body">Scan reason, levels, and journal history stay visible while the user reviews the symbol.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="lp-tab-panel" id="lp-tab-charts">
            <div className="lp-tp-text">
              <span className="lp-feat-label">Charts</span>
              <h3 className="lp-tp-h">Charting with RS line and pivot zones</h3>
              <p className="lp-tp-p">TradingView Lightweight Charts v5. Drawing tools, precomputed indicators, earnings overlays, and watchlist context on one screen.</p>
              <ul className="lp-feat-list">
                {["Candlestick charts with overlay indicators","Relative Strength line vs Nifty plotted on every chart","Pivot highs/lows marked as horizontal zones","Drawing tools: trendline, Fibonacci, horizontal, text","Broker connections are read-only/import only"].map(f => (
                  <li key={f} className="lp-fi"><div className="lp-fcheck">✓</div>{f}</li>
                ))}
              </ul>
            </div>
            <div className="lp-tv lp-tilt">
              <div className="lp-tv-bar"><div className="lp-dot" style={{background:"#FF5F57"}}></div><div className="lp-dot" style={{background:"#FFBD2E",marginLeft:6}}></div><span className="lp-card-title">DEEPAKNTR · Daily · EMA 21/50/200 · RS Line</span></div>
              <div className="lp-tv-body">
                <div style={{height:160,position:"relative",overflow:"hidden"}}>
                  <svg viewBox="0 0 400 160" preserveAspectRatio="none" style={{width:"100%",height:"100%"}}>
                    <defs>
                      <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity=".2"/>
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path ref={chartAreaRef} fill="url(#cg2)"/>
                    <path ref={chartLineRef} fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
                    <path ref={chartRsRef} fill="none" stroke="var(--info)" strokeWidth="1" strokeDasharray="4,3" opacity=".6"/>
                  </svg>
                </div>
                <div className="lp-chart-meta">
                  {[["O","2,791"],["H","2,856"],["L","2,774"]].map(c=><div key={c[0]} className="lp-cm">{c[0]} <span>{c[1]}</span></div>)}
                  <div className="lp-cm">C <span style={{color:"var(--gain)"}}>2,847</span></div>
                  <div className="lp-cm">RS <span style={{color:"var(--info)"}}>94</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Journal */}
          <div className="lp-tab-panel" id="lp-tab-journal">
            <div className="lp-tp-text">
              <span className="lp-feat-label">Journal</span>
              <h3 className="lp-tp-h">The proof layer for your process</h3>
              <p className="lp-tp-p">Log or import closed trades, compare outcome with the original reason, and save the process lesson that matters next time.</p>
              <ul className="lp-feat-list">
                {["Manual journal entry for trading routines","Broker-imported fills can become review items","Original scan, thesis, and invalidation stay visible","Lessons saved per trade — searchable, filterable","Pattern review is based only on closed trades"].map(f=>(
                  <li key={f} className="lp-fi"><div className="lp-fcheck">✓</div>{f}</li>
                ))}
              </ul>
            </div>
            <div className="lp-tv lp-tilt">
              <div className="lp-tv-bar"><div className="lp-dot" style={{background:"#FF5F57"}}></div><div className="lp-dot" style={{background:"#FFBD2E",marginLeft:6}}></div><span className="lp-card-title">Trade Journal · Apr 2025</span></div>
              <div className="lp-tv-body">
                {[["DEEPAKNTR","Apr 14 · 3d","+₹14,280",true],["CAMS","Apr 10 · 5d","+₹8,640",true],["RVNL","Apr 7 · 1d","−₹3,120",false],["DIXON","Apr 4 · 7d","+₹22,500",true]].map(j=>(
                  <div key={j[0] as string} className="lp-jrow"><div><div className="lp-sym">{j[0]}</div><div className="lp-sym-sub">{j[1]}</div></div><div className={j[3]?"lp-chg-pos":"lp-chg-neg"}>{j[2]}</div><div className="lp-ai-tag">Reviewed</div></div>
                ))}
                <div className="lp-ai-insight">
                  <div className="lp-ai-label">Journal observation — This week</div>
                  <div className="lp-ai-body">Day 1 exits show 2.1× lower R:R than day 3+ exits in this sample journal.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DESK ACTIVITY */}
      <section id="lp-social" style={{padding:"80px 0",background:"var(--lp-surface)",borderTop:"1px solid var(--lp-border)",borderBottom:"1px solid var(--lp-border)"}}>
        <div className="lp-wrap" style={{textAlign:"center"}}>
          <span className="lp-sec-label">Desk activity</span>
          <h2 className="lp-sec-title">Signals should carry context.</h2>
          <div className="lp-af">
            {[
              {av:"SC",bg:"#2D3A2D",t:<><strong>Scanner</strong> found <span className="lp-hl">VCP Momentum matches</span> for chart review</>,time:"scan"},
              {av:"WL",bg:"#2A2D3E",t:<><strong>Watchlist</strong> moved <span className="lp-hl">DIXON</span> into the active setup queue</>,time:"focus"},
              {av:"JR",bg:"#3A2A2A",t:<><strong>Journal</strong> flagged a repeat review theme: <span className="lp-hl">&ldquo;Cutting winners early&rdquo;</span></>,time:"review"},
              {av:"CH",bg:"#2A3A38",t:<><strong>Chart</strong> kept RS, levels, and notes attached to the symbol</>,time:"context"},
            ].map((a,i) => (
              <div key={i} className="lp-af-item">
                <div className="lp-af-av" style={{background:a.bg}}>{a.av}</div>
                <div className="lp-af-text">{a.t}</div>
                <div className="lp-af-time">{a.time}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW EXAMPLES */}
      <section id="workflow-examples" style={{padding:"100px 0"}}>
        <div className="lp-wrap" style={{textAlign:"center"}}>
          <span className="lp-sec-label">Workflow examples</span>
          <h2 className="lp-sec-title">Where AlphaVyuh should save time.</h2>
          <div className="lp-tgrid">
            {[
              {av:"SC",bg:"#2D3A2D",c:"var(--gain)",n:"Scanner to watchlist",r:"Discovery workflow",ret:"Less tab switching",q:"The product is designed so a scan result can become a focused watchlist candidate, then move straight into chart review without losing setup context."},
              {av:"CH",bg:"#2A2D3E",c:"var(--info)",n:"Watchlist to chart",r:"Planning workflow",ret:"Context stays attached",q:"Chart markings, active levels, and notes stay attached to the same symbol, so review does not split across disconnected tools."},
              {av:"JR",bg:"#2A3A38",c:"var(--accent)",n:"Journal to review",r:"Learning workflow",ret:"Mistakes become visible",q:"Every closed trade can carry the setup, exit reason, mistakes, lessons, and review notes needed to improve the next decision."},
            ].map((t,i) => (
              <div key={t.n} className="lp-tcard lp-tilt" style={{transitionDelay:(i*0.1)+"s"}}>
                <div className="lp-tstars">{t.r}</div>
                <p className="lp-tquote">{t.q}</p>
                <div className="lp-tauthor">
                  <div className="lp-tav" style={{background:t.bg,color:t.c}}>{t.av}</div>
                  <div><div className="lp-tname">{t.n}</div><div className="lp-tret">{t.ret}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{padding:"100px 0",background:"var(--lp-surface)",borderTop:"1px solid var(--lp-border)"}}>
        <div className="lp-wrap" style={{textAlign:"center"}}>
          <span className="lp-sec-label">Pricing</span>
          <h2 className="lp-sec-title">Plans for serious traders.</h2>
          <p className="lp-sec-sub" style={{ margin: "0 auto 28px" }}>Pricing is shown for planning. Billing is enabled per approved account.</p>
          <div className="lp-ptoggle">
            <span className="lp-pt-label lp-pt-active" id="lp-ptm">Monthly</span>
            <label className="lp-toggle-pill">
              <input type="checkbox" id="lp-billing"/>
              <div className="lp-pill-track"></div>
              <div className="lp-pill-thumb"></div>
            </label>
            <span className="lp-pt-label" id="lp-pta">Annual</span>
            <span className="lp-save-tag">Save 30%</span>
          </div>
          <div className="lp-pgrid">
            <div className="lp-pcard lp-fade">
              <span className="lp-plan-tier">Free</span>
              <div className="lp-price-row"><span className="lp-pcurr">₹</span><span className="lp-pval2" id="lp-p-free">0</span><span className="lp-pper">/mo</span></div>
              <p className="lp-pdesc">Enough to try everything. No credit card needed.</p>
              <Link href="/signup" className="lp-pcta lp-cta-free">Request access</Link>
              <div className="lp-pfeats">
                {[["50 scanner results per scan",true],["5 saved screens",true],["1 watchlist · 20 stocks",true],["Full charting",true],["3 months journal history",true],["Scan alerts",false],["Journal review",false],["Broker import",false]].map(f=>(
                  <div key={f[0] as string} className={"lp-pfi"+(f[1]?" lp-pfi-on":"")}>
                    <div className={"lp-pfcheck"+(f[1]?" lp-pfcheck-on":" lp-pfcheck-off")}>{f[1]?"✓":"–"}</div>
                    {f[0]}
                  </div>
                ))}
              </div>
            </div>
            <div className="lp-pcard lp-pcard-featured lp-fade" style={{transitionDelay:".1s"}}>
              <div className="lp-featured-badge">Core workflow</div>
              <span className="lp-plan-tier">Pro</span>
              <div className="lp-price-row"><span className="lp-pcurr">₹</span><span className="lp-pval2" id="lp-p-pro">599</span><span className="lp-pper">/mo</span><span className="lp-pold" id="lp-p-pro-old" style={{display:"none"}}>₹599</span></div>
              <p className="lp-pdesc">For active swing traders who scan daily and keep a structured review routine.</p>
              <Link href="/signup" className="lp-pcta lp-cta-pro">Request Pro access</Link>
              <div className="lp-pfeats">
                {[["500 scanner results per scan",true],["Unlimited saved screens",true],["10 watchlists · 200 stocks",true],["Full charting",true],["Unlimited journal history",true],["Broker import",true],["Journal review",true],["Priority support",true]].map(f=>(
                  <div key={f[0] as string} className="lp-pfi lp-pfi-on"><div className="lp-pfcheck lp-pfcheck-on">✓</div>{f[0]}</div>
                ))}
              </div>
            </div>
          </div>
          <p style={{marginTop:28,fontSize:".82rem",color:"var(--lp-muted)"}}>Pro is shown at the launch band (₹599/mo). Elite remains invite-only until the full tier ships. Billing is enabled after account approval.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{padding:"100px 0"}}>
        <div className="lp-wrap" style={{textAlign:"center"}}>
          <span className="lp-sec-label">FAQ</span>
          <h2 className="lp-sec-title">Common questions</h2>
          <div className="lp-faq-list">
            {[
              ["Does AlphaVyuh provide real-time stock data?","No. AlphaVyuh currently uses market data updated after the completed trading session. Scanner results are based on the latest completed session."],
              ["Which brokers are supported?","Zerodha Kite Connect v3 and Upstox v2 support read-only account checks, holdings/orderbook reads, filled-trade import, and journal sync where configured. Live and sandbox order placement are not enabled yet."],
              ["How does journal review work?","Every trade you log is stored in your journal. Review analytics summarize patterns from closed trades, including win rate, R:R, holding period, sector, and notes."],
              ["Is my trading data secure?","Yes. All data is stored in Supabase Postgres with Row Level Security — only you can access your trades, watchlists, and journal. Broker access tokens are stored encrypted after OAuth. We never ask for your broker password or developer API secrets."],
              ["How is billing handled?","Billing is enabled for approved accounts once payment configuration is complete."],
              ["Does AlphaVyuh give trade calls?","No. AlphaVyuh is an educational workflow and journal tool, not SEBI-registered investment advice or a guarantee of market-data accuracy."],
            ].map(([q,a]) => (
              <div key={q} className="lp-faq-item">
                <div className="lp-faq-q"><span>{q}</span><div className="lp-faq-icon">+</div></div>
                <div className="lp-faq-a"><p>{a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{padding:"120px 0",textAlign:"center",position:"relative",overflow:"hidden"}}>
        <div style={{position:"relative",zIndex:1}}>
          <div className="lp-live-pill" style={{display:"inline-flex",marginBottom:28}}><div className="lp-pulse" style={{marginRight:6}}></div>Account access</div>
          <h2 className="lp-sec-title lp-final-title" style={{marginBottom:18}}>Build a cleaner<br/>trading routine.</h2>
          <p className="lp-sec-sub" style={{margin:"0 auto 40px"}}>Scan after market close, keep the reason, plan levels, and review what happened.</p>
          <Link href="/signup" className="lp-btn-cta-big">Request access →</Link>
          <p style={{marginTop:20,fontSize:".8rem",color:"var(--lp-muted)"}}>Account access · EOD market data · Broker import only · No investment advice</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{background:"var(--lp-surface)",borderTop:"1px solid var(--lp-border)",padding:"64px 0 32px"}}>
        <div className="lp-wrap">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-logo" style={{marginBottom:14}}>
                <div className="lp-logo-mark"><svg viewBox="0 0 18 18" fill="none" width="18" height="18"><path d="M2 14L6.5 8L10 11L14.5 4L16 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="16" cy="6" r="1.5" fill="currentColor"/></svg></div>
                AlphaVyuh
              </div>
              <p style={{fontSize:".84rem",color:"var(--lp-text2)",lineHeight:1.65,maxWidth:240}}>India&apos;s trading workflow system. Scan markets, plan charts, and journal decisions in one focused flow.</p>
            </div>
            <div className="lp-fcol"><h5>Product</h5><ul><li><Link href="/products#scanner">Scanner</Link></li><li><Link href="/products">Charts</Link></li><li><Link href="/products#journal">Journal</Link></li><li><a href="#pricing">Pricing</a></li></ul></div>
            <div className="lp-fcol"><h5>Company</h5><ul><li><Link href="/products">About</Link></li><li><Link href="/access">Access guide</Link></li><li><Link href="/blog">Blog</Link></li><li><Link href="/contact">Contact</Link></li></ul></div>
            <div className="lp-fcol"><h5>Legal</h5><ul><li><Link href="/privacy">Privacy Policy</Link></li><li><Link href="/terms">Terms of Service</Link></li><li><Link href="/policies">Disclaimer</Link></li></ul></div>
          </div>
          <div className="lp-footer-bottom">
            <p>© 2026 AlphaVyuh. Not SEBI registered. Not investment advice.</p>
            <p>Made in India</p>
          </div>
        </div>
      </footer>
    </>
  );
}

const CSS = `
:root{--lp-bg:var(--surface-0);--lp-surface:var(--surface-1);--lp-surface2:var(--surface-2);--lp-surface3:var(--surface-3);--lp-accent:var(--accent);--lp-accent2:var(--info);--lp-accent-dim:var(--accent-subtle);--lp-accent-glow:var(--accent-glow);--lp-text:var(--text-primary);--lp-text2:var(--text-secondary);--lp-muted:var(--text-tertiary);--lp-border:var(--border-subtle);--lp-green:var(--gain);--lp-red:var(--loss);--lp-yellow:var(--warn);--lp-purple:var(--info);}
body{background:var(--lp-bg);color:var(--lp-text);font-family:var(--font-sans),sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--lp-bg)}::-webkit-scrollbar-thumb{background:var(--lp-border);border-radius:2px}
#lp-nav{position:fixed;top:0;left:0;right:0;z-index:1000;padding:20px 0;transition:all .3s}
#lp-nav.lp-scrolled{background:rgba(13,15,20,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--lp-border);padding:12px 0}
.lp-nav-wrap{max-width:1200px;margin:0 auto;padding:0 28px;display:flex;align-items:center;justify-content:space-between;gap:40px}
.lp-logo{display:flex;align-items:center;gap:10px;font-weight:650;font-size:1.05rem;letter-spacing:0;color:var(--lp-text);text-decoration:none}
.lp-logo-mark{width:34px;height:34px;background:linear-gradient(135deg,var(--lp-accent),var(--lp-accent2));border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-on-accent)}
.lp-nav-links{display:flex;align-items:center;gap:28px}
.lp-nav-links a{font-size:.85rem;font-weight:500;color:var(--lp-text2);text-decoration:none;transition:color .2s}
.lp-nav-links a:hover{color:var(--lp-text)}
.lp-nav-right{display:flex;align-items:center;gap:12px}
.lp-theme-toggle{height:34px;padding:0 12px;border:1px solid var(--lp-border);border-radius:8px;background:var(--lp-surface2);color:var(--lp-text);font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s}
.lp-theme-toggle:hover{border-color:var(--lp-accent);background:var(--lp-accent-dim)}
.lp-btn-ghost{padding:8px 18px;border:1px solid var(--lp-border);border-radius:8px;font-size:.84rem;font-weight:600;color:var(--lp-text2);text-decoration:none;transition:all .2s}
.lp-btn-ghost:hover{border-color:var(--lp-accent);color:var(--lp-accent)}
.lp-btn-cta{padding:9px 20px;border-radius:8px;font-size:.84rem;font-weight:650;background:var(--lp-accent);color:var(--text-on-accent);text-decoration:none;transition:all .2s;box-shadow:0 8px 22px rgba(0,0,0,.22)}
.lp-btn-cta:hover{box-shadow:0 12px 28px rgba(0,0,0,.28);transform:translateY(-1px)}
#lp-hero{display:flex;align-items:center;padding:128px 0 72px;position:relative;overflow:hidden}
.lp-grid-overlay{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:40px 40px;mask-image:radial-gradient(ellipse at 50% 50%,black 30%,transparent 80%);-webkit-mask-image:radial-gradient(ellipse at 50% 50%,black 30%,transparent 80%);pointer-events:none}
.lp-hero-inner{max-width:1200px;margin:0 auto;padding:0 28px;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;position:relative;z-index:1}
.lp-eyebrow{display:flex;align-items:center;gap:8px;margin-bottom:24px}
.lp-live-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(214,223,232,.08);border:1px solid rgba(214,223,232,.2);border-radius:20px;padding:5px 12px;font-size:.76rem;font-weight:600;color:var(--lp-accent);letter-spacing:0;text-transform:none}
.lp-pulse{width:7px;height:7px;background:var(--lp-accent);border-radius:50%;animation:lp-pulse 2s ease-in-out infinite;flex-shrink:0}
@keyframes lp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(214,223,232,.5)}50%{box-shadow:0 0 0 7px rgba(214,223,232,0)}}
.lp-h1{font-size:3.55rem;font-weight:650;line-height:1.04;letter-spacing:0;margin-bottom:18px}
.lp-h1-s1{display:block;color:var(--lp-text)}
.lp-sub{font-size:1.02rem;color:var(--lp-text2);line-height:1.75;margin-bottom:30px;max-width:540px}
.lp-ctas{display:flex;align-items:center;gap:14px;margin-bottom:44px;flex-wrap:wrap}
.lp-btn-primary{display:inline-flex;align-items:center;gap:8px;padding:13px 28px;background:var(--lp-accent);color:var(--text-on-accent);border-radius:9px;font-weight:650;font-size:.95rem;text-decoration:none;box-shadow:0 10px 28px rgba(0,0,0,.28);transition:all .25s}
.lp-btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.32)}
.lp-btn-secondary{display:inline-flex;align-items:center;gap:8px;padding:13px 24px;border:1.5px solid var(--lp-border);border-radius:9px;font-weight:600;font-size:.92rem;color:var(--lp-text2);text-decoration:none;transition:all .25s}
.lp-btn-secondary:hover{border-color:var(--lp-accent);color:var(--lp-accent)}
.lp-trust-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:560px}
.lp-trust-row span{padding:6px 10px;border:1px solid var(--lp-border);border-radius:999px;background:var(--lp-surface2);color:var(--lp-text2);font-size:.78rem;line-height:1.2}
.lp-hero-visual{position:relative}
.lp-hero-card{background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:12px;overflow:hidden;box-shadow:0 24px 58px rgba(0,0,0,.38),0 0 0 1px rgba(214,223,232,.05);animation:lp-float 8s ease-in-out infinite}
@keyframes lp-float{0%,100%{transform:translateY(0) rotate(.3deg)}50%{transform:translateY(-12px) rotate(-.3deg)}}
.lp-card-bar{background:var(--lp-surface2);padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--lp-border)}
.lp-dot{width:11px;height:11px;border-radius:50%}
.lp-card-title{margin-left:8px;font-size:.72rem;font-weight:600;color:var(--lp-muted)}
.lp-card-body{padding:16px}
.lp-col-header{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:6px 0;margin-bottom:4px}
.lp-col-h{font-size:.68rem;font-weight:600;text-transform:none;letter-spacing:0;color:var(--lp-muted)}
.lp-srow{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);animation:lp-row-in .4s ease both}
@keyframes lp-row-in{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
.lp-sym{font-size:.82rem;font-weight:700;font-family:var(--font-mono),monospace}
.lp-sym-sub{font-size:.62rem;color:var(--lp-muted)}
.lp-tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:600;letter-spacing:0}
.lp-tag-teal{background:rgba(214,223,232,.1);color:var(--lp-accent);border:1px solid rgba(214,223,232,.2)}
.lp-tag-green{background:rgba(45,181,116,.1);color:var(--lp-green);border:1px solid rgba(45,181,116,.2)}
.lp-tag-purple{background:rgba(167,139,250,.1);color:var(--lp-purple);border:1px solid rgba(167,139,250,.2)}
.lp-tag-yellow{background:rgba(245,158,11,.08);color:var(--lp-yellow);border:1px solid rgba(245,158,11,.2)}
.lp-pval{font-size:.82rem;font-weight:600;font-family:var(--font-mono),monospace}
.lp-rs-mini{display:flex;align-items:center;gap:5px}
.lp-rs-track{width:36px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden}
.lp-rs-fill{height:100%;background:var(--lp-accent);border-radius:2px}
.lp-rs-num{font-size:.72rem;color:var(--lp-text2)}
.lp-notif{position:absolute;background:var(--lp-surface2);border:1px solid var(--lp-border);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,.4);animation:lp-notif-in .5s ease both;z-index:10}
@keyframes lp-notif-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.lp-notif1{right:-20px;top:-28px;animation-delay:.8s}
.lp-notif2{left:-24px;bottom:40px;animation-delay:1.4s}
.lp-ni{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}
.lp-ni-green{background:rgba(45,181,116,.15)}.lp-ni-teal{background:var(--lp-accent-dim)}
.lp-nt{font-size:.75rem;display:flex;flex-direction:column;gap:2px}
.lp-nt strong{font-weight:700;color:var(--lp-text)}
.lp-nt span{color:var(--lp-text2)}
#lp-ticker{border-top:1px solid var(--lp-border);border-bottom:1px solid var(--lp-border);background:rgba(19,22,29,.8);padding:10px 0;overflow:hidden}
.lp-tape{display:flex;animation:lp-tape 30s linear infinite;width:max-content}
.lp-tape:hover{animation-play-state:paused}
.lp-tape-item{display:flex;align-items:center;gap:6px;padding:0 24px;border-right:1px solid var(--lp-border);white-space:nowrap}
.lp-tape-sym{font-size:.78rem;font-weight:700;color:var(--lp-text)}
.lp-tape-price{font-size:.78rem;color:var(--lp-text2)}
.lp-tape-pos{font-size:.75rem;font-weight:700;color:var(--lp-green)}
.lp-tape-neg{font-size:.75rem;font-weight:700;color:var(--lp-red)}
@keyframes lp-tape{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
#lp-stats{padding:80px 0}
.lp-wrap{max-width:1200px;margin:0 auto;padding:0 28px}
.lp-stats-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--lp-border);border-radius:16px;overflow:hidden;background:var(--lp-surface)}
.lp-stat{padding:36px 32px;border-right:1px solid var(--lp-border);position:relative;overflow:hidden;transition:background .3s}
.lp-stat:last-child{border-right:none}
.lp-stat:hover{background:var(--lp-surface2)}
.lp-stat::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--lp-accent),transparent);opacity:0;transition:opacity .3s}
.lp-stat:hover::after{opacity:1}
.lp-stat-num{font-size:2.25rem;font-weight:650;letter-spacing:0;color:var(--lp-text);line-height:1;margin-bottom:6px}
.lp-stat-label{font-size:.82rem;color:var(--lp-text2)}
.lp-stat-sub{font-size:.72rem;color:var(--lp-muted);margin-top:3px}
.lp-sec-label{font-size:.78rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--lp-accent);display:block;margin-bottom:12px}
.lp-sec-title{font-size:2.25rem;font-weight:650;letter-spacing:0;margin-bottom:16px}
.lp-sec-sub{font-size:.95rem;color:var(--lp-text2);line-height:1.7;max-width:520px}
.lp-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin-top:64px;position:relative}
.lp-steps::before{content:'';position:absolute;top:28px;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,var(--lp-border) 15%,var(--lp-border) 85%,transparent)}
.lp-step{text-align:center;padding:0 12px;position:relative;z-index:1;opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s ease}
.lp-step.lp-visible{opacity:1;transform:none}
.lp-step-num{width:56px;height:56px;border-radius:50%;border:1.5px solid var(--lp-border);background:var(--lp-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:.8rem;font-weight:650;color:var(--lp-accent);transition:all .3s}
.lp-step:hover .lp-step-num{border-color:var(--lp-accent);background:var(--lp-accent-dim);box-shadow:0 0 24px var(--lp-accent-glow)}
.lp-step h3{font-size:.95rem;font-weight:700;margin-bottom:8px}
.lp-step p{font-size:.78rem;color:var(--lp-text2);line-height:1.55}
.lp-tabs-wrap{display:flex;background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:12px;padding:6px;margin-bottom:52px;align-self:flex-start;flex-wrap:wrap;gap:4px;width:fit-content}
.lp-tab-btn{padding:10px 22px;border-radius:8px;font-size:.85rem;font-weight:600;color:var(--lp-text2);transition:all .2s;white-space:nowrap;background:none;border:none;cursor:pointer}
.lp-tab-btn.lp-tab-active{background:var(--lp-surface3);color:var(--lp-text);box-shadow:0 2px 8px rgba(0,0,0,.3)}
.lp-tab-panel{display:none;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
.lp-tab-panel.lp-tab-active{display:grid}
.lp-feat-label{font-size:.78rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--lp-accent);display:block;margin-bottom:12px}
.lp-tp-h{font-size:1.75rem;font-weight:650;letter-spacing:0;margin-bottom:16px}
.lp-tp-p{font-size:.93rem;color:var(--lp-text2);line-height:1.75;margin-bottom:28px}
.lp-feat-list{display:flex;flex-direction:column;gap:12px;list-style:none;padding:0;margin:0}
.lp-fi{display:flex;align-items:flex-start;gap:12px;font-size:.87rem;color:var(--lp-text2)}
.lp-fcheck{width:20px;height:20px;background:var(--lp-accent-dim);border:1px solid rgba(214,223,232,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;font-size:.6rem;color:var(--lp-accent)}
.lp-tv{background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4)}
.lp-tv-bar{background:var(--lp-surface2);padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--lp-border)}
.lp-tv-body{padding:16px}
.lp-filter-bar{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.lp-chip{padding:5px 12px;background:var(--lp-surface3);border:1px solid var(--lp-border);border-radius:6px;font-size:.72rem;font-weight:600;color:var(--lp-text2)}
.lp-chip-on{background:var(--lp-accent-dim);border-color:rgba(214,223,232,.3);color:var(--lp-accent)}
.lp-rcount{font-size:.72rem;color:var(--lp-text2);margin-bottom:10px}
.lp-rcount span{color:var(--lp-accent);font-weight:700}
.lp-sr{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04);align-items:center}
.lp-chg-pos{font-size:.75rem;font-weight:700;color:var(--lp-green)}
.lp-chg-neg{font-size:.75rem;font-weight:700;color:var(--lp-red)}
.lp-chart-meta{display:flex;gap:20px;margin-top:10px}
.lp-cm{font-size:.72rem;color:var(--lp-text2)}.lp-cm span{font-weight:700;color:var(--lp-text)}
.lp-jrow{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--lp-surface3);border-radius:8px;border:1px solid var(--lp-border);margin-bottom:8px}
.lp-ai-tag{font-size:.68rem;color:var(--lp-accent);background:var(--lp-accent-dim);border-radius:4px;padding:2px 7px;border:1px solid rgba(214,223,232,.2)}
.lp-ai-insight{margin-top:14px;padding:12px;background:var(--lp-surface3);border-radius:8px;border:1px solid rgba(214,223,232,.12)}
.lp-ai-label{font-size:.72rem;font-weight:600;color:var(--lp-accent);letter-spacing:0;text-transform:none;margin-bottom:6px}
.lp-ai-body{font-size:.78rem;color:var(--lp-text2);line-height:1.6}
.lp-af{max-width:700px;margin:48px auto 0;display:flex;flex-direction:column;gap:12px}
.lp-af-item{display:flex;align-items:center;gap:14px;background:var(--lp-bg);border:1px solid var(--lp-border);border-radius:10px;padding:12px 16px;opacity:0;transform:translateX(-20px);transition:opacity .5s,transform .5s,box-shadow .3s}
.lp-af-item.lp-visible{opacity:1;transform:none}
.lp-af-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0}
.lp-af-text{flex:1;font-size:.83rem;color:var(--lp-text2)}.lp-af-text strong{color:var(--lp-text)}
.lp-hl{color:var(--lp-accent)}
.lp-af-time{font-size:.72rem;color:var(--lp-muted);white-space:nowrap}
.lp-tgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:56px}
.lp-tcard{background:var(--lp-surface);border:1px solid var(--lp-border);border-radius:12px;padding:28px;opacity:0;transform:translateY(24px);transition:opacity .6s,transform .6s,border-color .3s;position:relative;overflow:hidden}
.lp-tcard.lp-visible{opacity:1;transform:none}
.lp-tcard:hover{border-color:rgba(214,223,232,.15)}
.lp-tstars{color:var(--lp-accent);font-size:.78rem;font-weight:600;letter-spacing:0;margin-bottom:16px}
.lp-tquote{font-size:.9rem;color:var(--lp-text);line-height:1.75;font-style:normal;margin-bottom:20px}
.lp-tauthor{display:flex;align-items:center;gap:12px}
.lp-tav{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;flex-shrink:0}
.lp-tname{font-size:.87rem;font-weight:700}.lp-tret{font-size:.75rem;color:var(--lp-green);font-weight:700;margin-top:2px}
.lp-ptoggle{display:flex;align-items:center;justify-content:center;gap:16px;margin:48px 0}
.lp-pt-label{font-size:.9rem;color:var(--lp-text2);font-weight:500;transition:color .2s}
.lp-pt-label.lp-pt-active{color:var(--lp-text);font-weight:700}
.lp-toggle-pill{position:relative;width:52px;height:28px;cursor:pointer}
.lp-toggle-pill input{opacity:0;width:0;height:0;position:absolute}
.lp-pill-track{position:absolute;inset:0;background:var(--lp-border);border-radius:14px;transition:background .3s}
.lp-pill-thumb{position:absolute;top:4px;left:4px;width:20px;height:20px;background:var(--lp-text2);border-radius:50%;transition:all .3s}
.lp-toggle-pill input:checked + .lp-pill-track{background:var(--lp-accent)}
.lp-toggle-pill input:checked ~ .lp-pill-thumb{transform:translateX(24px);background:#050a08}
.lp-save-tag{background:rgba(214,223,232,.12);color:var(--lp-accent);border:1px solid rgba(214,223,232,.2);padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:600;letter-spacing:0}
.lp-pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start}
.lp-pcard{background:var(--lp-bg);border:1px solid var(--lp-border);border-radius:14px;padding:32px;position:relative;transition:all .3s;opacity:0;transform:translateY(24px)}
.lp-pcard.lp-visible{opacity:1;transform:none}
.lp-pcard:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,.3)}
.lp-pcard-featured{background:linear-gradient(145deg,#16202E,var(--lp-surface2));border-color:var(--lp-accent);box-shadow:0 0 48px rgba(214,223,232,.08)}
.lp-pcard-featured:hover{box-shadow:0 0 64px rgba(214,223,232,.12),0 16px 40px rgba(0,0,0,.3)}
.lp-featured-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:var(--lp-accent);color:var(--text-on-accent);padding:4px 18px;border-radius:20px;font-size:.72rem;font-weight:650;letter-spacing:0;white-space:nowrap}
.lp-plan-tier{font-size:.78rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--lp-text2);display:block;margin-bottom:10px}
.lp-price-row{display:flex;align-items:baseline;gap:4px;margin-bottom:4px}
.lp-pcurr{font-size:1.2rem;font-weight:600;line-height:2.2}
.lp-pval2{font-size:2.45rem;font-weight:650;letter-spacing:0;line-height:1}
.lp-pper{font-size:.8rem;color:var(--lp-text2);margin-left:2px}
.lp-pold{font-size:.85rem;color:var(--lp-muted);text-decoration:line-through;margin-left:8px}
.lp-pdesc{font-size:.83rem;color:var(--lp-text2);margin:12px 0 24px;min-height:36px;line-height:1.6}
.lp-pcta{display:block;text-align:center;padding:12px;border-radius:9px;font-weight:700;font-size:.9rem;margin-bottom:28px;transition:all .25s;text-decoration:none}
.lp-cta-free{border:1.5px solid var(--lp-border);color:var(--lp-text2)}.lp-cta-free:hover{border-color:rgba(214,223,232,.5);color:var(--lp-accent)}
.lp-cta-pro{background:var(--lp-accent);color:var(--text-on-accent);box-shadow:0 0 24px rgba(214,223,232,.25)}.lp-cta-pro:hover{box-shadow:0 0 36px rgba(214,223,232,.4)}
.lp-cta-elite{border:1.5px solid rgba(167,182,200,.3);color:var(--lp-accent2)}.lp-cta-elite:hover{background:rgba(167,182,200,.1)}
.lp-pfeats{display:flex;flex-direction:column;gap:10px}
.lp-pfi{display:flex;align-items:center;gap:10px;font-size:.82rem;color:var(--lp-text2)}
.lp-pfi-on{color:var(--lp-text)}
.lp-pfcheck{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.6rem;flex-shrink:0}
.lp-pfcheck-on{background:var(--lp-accent-dim);color:var(--lp-accent);border:1px solid rgba(214,223,232,.2)}
.lp-pfcheck-off{background:var(--lp-surface2);color:var(--lp-muted);border:1px solid var(--lp-border)}
.lp-faq-list{max-width:720px;margin:56px auto 0;text-align:left}
.lp-faq-item{border-bottom:1px solid var(--lp-border);overflow:hidden}
.lp-faq-q{display:flex;align-items:center;justify-content:space-between;padding:20px 0;cursor:pointer;gap:20px}
.lp-faq-q span{font-size:.97rem;font-weight:600;color:var(--lp-text);flex:1;line-height:1.4}
.lp-faq-icon{width:26px;height:26px;border:1.5px solid var(--lp-border);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--lp-text2);font-size:.9rem;transition:all .3s}
.lp-faq-item.lp-faq-open .lp-faq-icon{border-color:var(--lp-accent);color:var(--lp-accent);background:var(--lp-accent-dim);transform:rotate(45deg)}
.lp-faq-a{max-height:0;overflow:hidden;transition:max-height .35s ease,padding .35s ease}
.lp-faq-item.lp-faq-open .lp-faq-a{max-height:200px;padding-bottom:20px}
.lp-faq-a p{font-size:.88rem;color:var(--lp-text2);line-height:1.75}
.lp-btn-cta-big{display:inline-flex;align-items:center;gap:10px;padding:16px 40px;background:var(--lp-accent);color:var(--text-on-accent);font-weight:650;font-size:1rem;border-radius:10px;text-decoration:none;box-shadow:0 12px 32px rgba(0,0,0,.28);transition:all .25s}
.lp-btn-cta-big:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(0,0,0,.34)}
.lp-final-title{font-size:3rem}
.lp-footer-grid{display:grid;grid-template-columns:2.5fr 1fr 1fr 1fr;gap:48px;margin-bottom:48px}
.lp-fcol h5{font-size:.78rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--lp-muted);margin-bottom:18px}
.lp-fcol ul{list-style:none;padding:0;margin:0}
.lp-fcol li{margin-bottom:12px}
.lp-fcol a{font-size:.84rem;color:var(--lp-text2);text-decoration:none;transition:color .2s}
.lp-fcol a:hover{color:var(--lp-accent)}
.lp-footer-bottom{border-top:1px solid var(--lp-border);padding-top:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.lp-footer-bottom p{font-size:.78rem;color:var(--lp-muted)}
.lp-fade{opacity:0;transform:translateY(32px);transition:opacity .7s ease,transform .7s ease}
.lp-fade.lp-visible{opacity:1;transform:none}
.lp-tilt{transform-style:preserve-3d;transition:transform .1s ease}
@media(max-width:1024px){
  .lp-hero-inner{grid-template-columns:1fr;gap:56px}
  .lp-hero-visual{display:none}
  .lp-tab-panel.lp-tab-active{grid-template-columns:1fr}
  .lp-pgrid{grid-template-columns:1fr}
  .lp-tgrid{grid-template-columns:1fr}
  .lp-footer-grid{grid-template-columns:1fr 1fr}
  .lp-steps{grid-template-columns:repeat(5,minmax(96px,1fr));gap:12px}
  .lp-step{padding:0 6px}
  .lp-step-num{width:48px;height:48px;margin-bottom:16px}
  .lp-step p{font-size:.72rem;line-height:1.45}
  .lp-steps::before{left:8%;right:8%;top:24px}
  .lp-stats-grid{grid-template-columns:1fr 1fr}
  .lp-stat:nth-child(2){border-right:none}
  .lp-stat:nth-child(3){border-top:1px solid var(--lp-border)}
  .lp-nav-links,.lp-nav-right{display:none}
}
@media(max-width:640px){
  .lp-h1{font-size:2.45rem}
  .lp-sec-title{font-size:1.8rem}
  .lp-final-title{font-size:2.2rem}
  .lp-tp-h{font-size:1.45rem}
  .lp-stat-num{font-size:1.9rem}
  .lp-steps,.lp-pgrid,.lp-tgrid,.lp-footer-grid{grid-template-columns:1fr}
  .lp-steps{gap:32px}
  .lp-steps::before{display:none}
  .lp-step{padding:0 12px}
  .lp-step-num{width:56px;height:56px;margin-bottom:20px}
  .lp-step p{font-size:.78rem;line-height:1.55}
  .lp-stat{border-right:none;border-top:1px solid var(--lp-border)}
  .lp-stat:first-child{border-top:none}
  .lp-tv{display:none}
  .lp-tab-panel.lp-tab-active{grid-template-columns:1fr}
  #lp-ticker{display:none}
}
`;
