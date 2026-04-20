# AlphaVyuh — Product Spec

**Every agent reads this file before every task. It's the source of truth.**

## What AlphaVyuh is

AlphaVyuh is India's Trading OS — the end-to-end workbench for NSE swing traders who want to scan, chart, trade, journal, and learn from their mistakes in one connected platform, without switching between Chartink, TradingView, Zerodha, and a spreadsheet.

**One-line pitch:** "Replace Chartink + TradingView + Screener + Kite with one connected platform. Scan, chart, trade, and let AI review your journal."

## Who it's for

Indian retail swing traders, specifically:
- Active swing traders trading NSE/BSE equities
- Using Zerodha or Upstox as broker
- Following momentum, VCP, Stage 2, breakout methodologies (Minervini, Qullamaggie)
- Serious about improving — journals their trades, reviews mistakes
- Currently paying for 3-4 tools separately (Chartink ₹480/mo, TradingView ₹1200/mo, etc.)

Not for: day traders, F&O-only traders, US market traders (until Elite tier launches).

## The complete user journey (must work end-to-end)

1. **Lands on alphavyuh.com** — sees "India's Trading OS", one-page pitch
2. **Signs up** — email + password, no email confirmation needed, goes straight to app
3. **Onboarding** — first-time banner explains: Scan → Watchlist → Chart → Trade → Review
4. **Scanner** — picks a preset (VCP, Breakout, Stage 2), runs scan, sees 100+ stocks
5. **Adds to watchlist** — one click from scanner result
6. **Charts** — hovers stock on watchlist, full chart appears with EMAs, RSI, volume
7. **Places order** — if broker connected, one-click order from chart itself
8. **Auto-journaled** — trade appears in journal automatically
9. **AI review** — weekly, Claude analyzes trades, surfaces mistakes, remembers across weeks
10. **Learns, improves** — next week, fewer mistakes of the same kind

The product's entire thesis is: **these 10 steps must feel like one continuous flow.** Currently many of them break at the seams.

## Three launch-critical differentiators

Everything else is table stakes. These are what get us talked about:

1. **One-click orders from scanner → Zerodha/Upstox** — click stock, click Buy, done. No tab-switching.
2. **AI journal review with persistent memory** — Claude remembers your top 3 mistakes across weeks. Week 4's analysis references Week 1's patterns.
3. **Market breadth analytics** — sector rotation, % above EMAs, A/D ratios. The macro view most retail platforms skip.

**Cut for launch:** Telegram alerts (can add post-launch), US markets, backtesting, options.

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
- **Confident, not salesy.** "India's Trading OS." not "The best trading platform ever!"
- **Technical, not dumbed-down.** Uses VCP, Stage 2, RS without explaining — audience knows.
- **Short sentences.** "Scan for stocks, add to watchlist, chart them, log your trade." Not paragraphs.
- **Specific numbers over adjectives.** "120ms scan time" not "fast scanning".
- **Lowercase product terms:** "scanner", "watchlist", "journal". Not "Scanner", not "SCANNER".

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

## Product pricing (live on landing page, must match app)

| Plan | Price/mo | Key limits |
|------|----------|-----------|
| Free | ₹0 | 50 scanner results, 5 saved screens, 1 watchlist × 20 stocks, 3mo journal history |
| Pro | ₹1,999 | 500 results, unlimited screens, 10 watchlists × 200 stocks, unlimited journal, broker integration, weekly AI review |
| Elite | ₹4,999 | Everything in Pro + US markets, AI deep analysis per trade, backtest scanners, priority support |

Annual = 30% off monthly.

## Current product state (as of Apr 2026)

**Working:**
- Dashboard loads breadth data (advances/declines/EMA %)
- Scanner has filters but backend auth is broken
- Watchlist + chart views exist but broker integration stubbed
- Journal has 3 tabs, setup chips, manual entry
- Design system tokens + primitives exist in `frontend/components/ui/`
- Daily data refresh cron live (GitHub Actions at 4:30 PM IST)
- Data health endpoint `/api/v1/data/health`

**Broken:**
- Login → "Invalid credentials" for some users (Supabase config)
- Scanner/watchlist/journal show "Not authenticated" (auth header not attached)
- Sector breadth data empty on dashboard
- Primary button text invisible (dark-on-dark contrast bug)

**Missing:**
- Broker integration end-to-end flow (Zerodha OAuth stubbed)
- AI journal review with memory (the #1 differentiator — not built yet)
- Payment flow with Razorpay (stubbed)
- App pages matching landing page design identity (app still feels generic)

## Launch target

25 days from Apr 19, 2026 → **May 14, 2026**

Success = 20 real traders signed up, 5 paying Pro, all 10 user-journey steps work without a bug.
