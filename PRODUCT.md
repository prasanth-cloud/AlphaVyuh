# AlphaVyuh — Product Spec

**Every agent reads this file before every task. It's the source of truth.**

## What AlphaVyuh is

AlphaVyuh is the one-stop trading workflow platform for NSE swing traders. Traders build their own scanners and watchlists, analyze stocks with charts and market data, trade directly through connected brokers, import or sync trades from broker statements, and review their own performance through analytics based on their actual history.

**One-line pitch:** "Scan markets, build watchlists, analyze charts, trade through your broker, and review your performance — all in one place."

**The Cardinal Rule:** AlphaVyuh informs, organizes, executes, and analyzes — it does not advise.

## What AlphaVyuh is not

- An advisor
- A signal service
- A "tells you what to trade" platform
- An analyst opinion provider

## Who it's for

Indian retail swing traders, specifically:
- Active swing traders trading NSE/BSE equities
- Using Zerodha or planning to connect Zerodha once broker import and read-only sync are stable
- Following momentum, VCP, Stage 2, breakout methodologies (Minervini, Qullamaggie)
- Serious about improving — journals their trades, reviews mistakes
- Currently managing scanner, charts, watchlists, broker context, and journal notes across multiple tools

Not for: day traders, F&O-only traders, US market traders (until Elite tier launches).

## Professional Access focus

Professional Access should feel simple: open the app, find useful market context, save symbols, inspect charts, and keep a journal. Avoid adding visible process layers unless they reduce clicks or confusion.

Everything else is secondary until the core pages feel obvious and stable.

## Launch-critical differentiators

Everything else is table stakes. These are what get us talked about:

1. **Connected workflow context** — a symbol carries scan reason, watchlist state, chart notes, broker context, and journal history.
2. **Journal review with persistent memory** — review identifies repeated mistakes across weeks, not just one-trade summaries.
3. **Market breadth analytics** — sector rotation, % above EMAs, A/D ratios. The macro view most retail platforms skip.

**Defer until the core workflow is stable:** Telegram alerts, broker order execution, trade report OCR, US markets, backtesting, options.

## Visual identity (established by landing page)

These rules apply to EVERY surface — landing, app, emails, onboarding.

### Colors
- **Background:** `#0A0E13` (deep near-black, subtle cool tone) — never pure black
- **Surface:** `#12161D` (cards, panels)
- **Surface elevated:** `#1A1F28` (hover, nested)
- **Borders:** `rgba(255,255,255,0.06)` subtle, `rgba(255,255,255,0.10)` default
- **Accent (the ONE brand color):** `#00D9A7` teal — logo tile, primary CTAs, active states, eyebrow labels
- **Accent subtle:** `rgba(0,217,167,0.10)` for teal-tinted backgrounds
- **Text primary:** `#F1EFE8` (warm off-white)
- **Text secondary:** `#A8A29E` (muted)
- **Text tertiary:** `#6A6A6A` (labels, captions)
- **Semantic P&L — use ONLY for gain/loss:**
  - Gain: `#2DB574` (slightly desaturated green)
  - Loss: `#E15560` (slightly desaturated red)

### Typography
- **Display headlines** (hero, section heads): Inter or similar, weight 700-800, tracking -0.03em, line-height 1.05. Massive and confident.
  - Hero: 64-72px
  - Section: 44-52px
  - Page: 28-32px
- **Body:** Inter regular 400, size 15-16px, line-height 1.6
- **Eyebrow labels** (THE signature): Inter 600, size 11px, uppercase, tracking 0.14em, color `var(--accent)`
- **Numbers/data:** JetBrains Mono with tabular-nums. Always.

### Voice
- **Informational, not advisory.** "Market breadth is weak — only 38% above EMA 200." Never "trade half size."
- **Confident, not salesy.** "India's Trading OS." not "The best trading platform ever!"
- **Technical, not dumbed-down.** Uses VCP, Stage 2, RS without explaining — audience knows.
- **Short sentences.** "Scan, organize, execute, review." Not paragraphs.
- **Specific numbers over adjectives.** "120ms scan time" not "fast scanning."
- **Lowercase product terms:** "scanner", "watchlist", "journal". Not "Scanner", not "SCANNER".
- **Never use these phrases anywhere:**
  - "Recommended action"
  - "Best opportunity"
  - "We suggest"
  - "You should"
  - "Trade size today"
  - "Buy now" / "Sell now"
  - Any verb in imperative mood telling the user to take a position

## Page Roles

| Page | Role | Forbidden behavior |
|------|------|-------------------|
| Dashboard | Market context + workflow launcher | No "do this" copy. No prescriptions. |
| Scanner | User-controlled discovery engine | No preset called "Recommended". |
| Watchlist | User-owned analysis and execution planning | No "ratings" on stocks. |
| Chart | Stock analysis + broker order entry initiated by user | No buy/sell signals overlay. |
| Journal | Performance analysis based on user's own trades | OK to give feedback on past trades. |
| Trade Report Upload | First-class import for users who trade elsewhere | No claims based on future positions. |

## Cardinal Rule Test

Every PR must answer: "Could a SEBI regulator interpret any new copy as advice?"

If yes, rewrite before merge. AlphaVyuh informs, organizes, executes, and analyzes — it does not advise.

### Layout rhythm
- Generous negative space. If it feels too sparse, it's probably right.
- Macs-style window mockups (3 traffic-light dots) for product previews. Floating, subtle shadow, slight rotation OK.
- Content max-width 1440px, body gutters 32px desktop / 16px mobile.
- 8px spacing grid, strict.
- Sections 96-128px tall, separated by thin borders not shadows.

### Components with existing treatment
- **Pill CTAs:** Teal filled for primary, outlined teal for secondary, ghost for tertiary
- **Eyebrow labels:** ALWAYS precede section headlines. "WORKFLOW" / "PLATFORM" / "PRICING" / "SCANNER"
- **Feature tab pills:** Rounded corners, filled teal when active, transparent when inactive. Groups of 3-4.
- **Checkmark lists:** Teal circle outline + teal check inside. 16px icon, 14px text.
- **Price displays:** ₹ symbol 60% size of number, /mo in tertiary color smaller
- **"MOST POPULAR" pill:** Teal outlined ring around the whole card, teal pill above with the label

### What NOT to do
- No gradients on backgrounds (landing is flat near-black)
- No purple/pink/blue — teal is the ONLY brand color
- No emojis in UI chrome (the 🚀 📉 📈 etc. you had on scanner presets — remove all)
- No drop shadows on cards (use borders)
- No "AI-generated look" — no glassmorphism, no neumorphism, no 3D effects
- No animations except micro-interactions (hover transitions < 200ms)
- No Title Case. Always sentence case. "Start free" not "Start Free"

## Pricing (live on landing page)

| Plan | Monthly | Annual (30% off) | Broker | Scanner results | Watchlists |
|------|---------|------------------|--------|-----------------|------------|
| Free | ₹0 | — | Not included | 50 per scan | 1 × 20 stocks |
| Pro | ₹1,999 | ₹16,800 | Zerodha + Upstox | 500 per scan | 10 × 200 stocks |
| Elite | ₹4,999 | ₹41,990 | Zerodha + Upstox, advanced features later | 500 per scan | 10 × 200 stocks |

Plan gating enforced server-side in:
- `backend/app/routers/scanner.py` — limits results based on plan.
- `backend/app/routers/watchlists.py` — limits watchlist count and size.
- `backend/app/routers/broker.py` and `backend/app/routers/brokers.py` — returns 403 for free users on broker connect/import/live-order routes.
- `backend/app/routers/journal.py` — limits free history retention.

## Current product state (as of Apr 2026)

**Working for Professional Access:**
- Dashboard loads market breadth and data provenance.
- Scanner supports presets, saved screens, 52-week filters, and backend auth headers.
- Watchlist, chart views, journal, and manual/simulated trade flow are usable.
- Zerodha broker import exists and must be verified per account before execution is enabled.
- Data health endpoint `/api/v1/data/health` and data freshness center exist.
- Landing/public footer pages use Professional Access copy and avoid fake social proof.

**Still launch-risky:**
- Market data licensing for production realtime/delayed display is not finalized.
- Broker order flow needs small-group verification before wider launch.
- AI journal review memory needs hardening before paid public positioning.
- Payment mode and pricing stay approval-managed until Razorpay and data costs are final.

## Launch target

25 days from Apr 19, 2026 → **May 14, 2026**

Professional Access success = 10-25 serious traders onboarded manually, scanner/chart/watchlist/journal used across real routines, and every data/broker issue captured before public paid launch.
