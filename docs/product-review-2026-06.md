# AlphaVyuh Product Review — June 2026

**Date:** 2026-06-09/10
**Scope:** Full signed-in production QA sweep (pro-plan QA account), UI/UX design audit, competitor & community research, codebase feature inventory.
**Method:** Four parallel review workstreams (feature QA in a real browser against https://www.alphavyuh.com, design audit, web research across 8 competitors and Indian trading communities, repo inventory) plus direct production API verification.
**Posture reminder:** This is a plan document. No product changes were made. Pricing, billing, broker, and launch-posture items below are owner decisions.

---

## 0. Executive summary

- The closed loop scan → watchlist → chart plan → journal → review is **substantially built and mostly works in production**. Auth, dashboard breadth, watchlist, charts (indicators + persisted drawings), journal, settings, and billing surfaces all passed signed-in QA.
- **The single worst finding is a P0 trust bug, not an outage:** the scanner UI shows "DATA API DOWN", disables Run scan, and renders a neutral "No stocks matched" empty state — while the production scan API is healthy (verified directly: `POST /api/v1/scanner/run` returned 1,000 trend-template matches for 2026-06-09 in ~7s; data health reports 90.2% coverage, `status: healthy`). The discovery engine is dark for users for no backend reason.
- The Kite live-market token is invalid in production (`TokenException` 403, stream disconnected). EOD data is current. Anything in the UI keyed off live-feed status must not imply EOD data is down.
- Competitor research says the wedge (ADR 013) is real and unoccupied: nobody combines India-priced scanning with auto-journaling and AI feedback. Zerodha publicly said journal analytics is "WIP" (Feb 2026) — there is a window, and it is closing.
- Current Pro pricing (₹1,999/mo) sits far above the validated Indian willingness-to-pay band (₹400–800/mo; Chartink ₹780, ChartsMaze ₹499, Screener.in ₹417/mo-equivalent). Pricing posture needs an owner decision before public paid launch.
- Several built surfaces (portfolio, upload, options, community, multi-chart board, data status) are invisible — not in the 4-item nav — so QA initially scored them "absent". Decide per surface: promote or cut. ADR 013 already answers most of these: cut/park.

---

## 1. Feature matrix

Statuses merge the signed-in production QA sweep (2026-06-09 late evening IST-overnight) with the codebase inventory. "Built (hidden)" = exists in code/route but not reachable from primary nav.

| Feature | Prod status | Build status | Usefulness verdict | Evidence |
|---|---|---|---|---|
| Landing page | WORKS | Built | Keep | Clean copy, pricing tiers, no fake social proof |
| Login / auth | WORKS | Built | Keep | First-attempt login, session stable across nav |
| Dashboard (Today) | WORKS (~3s) | Built | Keep — essential | Market pulse, sector breadth (12+ sectors), top movers, EMA breadth (1,835 adv / 526 dec), review-debt nudges |
| Market overview | WORKS (on dashboard) | Built (no dedicated page) | Keep as-is | Breadth lives on dashboard; a separate `/market` page is unnecessary |
| **Scanner** | **DEGRADED — P0** | Built (6 presets, 20+ filters, saved screens) | Keep — essential, fix now | UI: "DATA API DOWN", Run scan disabled, neutral "No stocks matched" empty state. Backend verified healthy: scan API returns 1,000 matches in ~7s; data health `status: healthy`, 90.2% coverage. Frontend status wiring is wrong and violates the trust invariant |
| Watchlist + Decision Desk | WORKS (instant) | Built | Keep — essential | Seeded symbols loaded with quotes, mini chart, persisted trendline; filter tabs; plan/desk fields |
| Charts `/charts/[symbol]` | WORKS (~2s) | Built (Lightweight Charts, not TradingView lib) | Keep — essential | Timeframes, EMA indicators, drawings persisted, compare + price-alert buttons, setup checklist, trade plan panel |
| Multi-chart board `/charts` | Untested in nav | Built (hidden) | Improve or fold into watchlist | Review board, not overlay compare; not in nav |
| Journal | WORKS (instant) | Built | Keep — essential (the wedge) | Review queue default, analytics tabs, decision memory widget, log/import CTAs; honest empty state |
| Journal AI insights | PARTIAL | Partial (local statistical engine, not M7 LLM) | Improve — wedge-critical | `backend/app/routers/ai.py`; pattern stats exist, no LLM insight layer yet |
| Broker import (Zerodha/Upstox) | Flow visible, not exercised | Built (gated; live orders env-gated) | Keep | 5-broker dropdown, OAuth hub copy; real-token smoke is owner-gated |
| Live order placement | Not tested (gated) | Partial (code complete, env-gated) | Keep gated | `BROKER_LIVE_ORDERS_ENABLED=false`; simulated journal capture is the default path |
| Alerts (scan matches) | DEGRADED | Built | Improve | "Loading scan alert queue..." and "Waiting for latest EOD data." never resolve to content or a final state |
| Price alerts (from chart) | Button present, flow untested | Built | Keep | `createPriceAlert` wired on chart page |
| Portfolio | Not in nav | Partial (journal-derived, hidden) | Improve later (M5) | `/portfolio` exists; not live broker holdings sync |
| Backtest | ABSENT (no UI) | API only | Park (per ADR 013) | `POST /api/v1/backtest/run` exists; no page, correctly deferred |
| Options | Not in nav | Partial (payoff calculator, hidden) | **Cut from product surface** | Audience mismatch per ADR 013; mock fallback present |
| Community | Not in nav | Partial (browse/upvote only; no share flow) | **Cut until ~500 users** | `shareScreen` API unused by any UI |
| Trade report upload | Not in nav | Built (hidden) | Promote — wedge-adjacent | `/upload` CSV parse + journal import; PRODUCT.md calls it first-class |
| Data status `/data` | Link 404'd in QA (`/data-status`) | Built at `/data` | Keep — fix link/route | Either a stale dashboard link or route gating; the canonical trust surface must be reachable |
| Settings — profile | WORKS | Built | Keep | Display name, Telegram chat-ID config |
| Settings — billing | WORKS (view) | Partial (checkout owner-gated) | Keep | "Billing is not enabled" banner honest; no next-step guidance for the user |
| Settings — broker | WORKS (view) | Built | Keep | Read-only smoke + import posture clear |
| Feedback widget | WORKS | Built | Keep | Type dropdown + free text, global |
| Onboarding | Untestable (QA account pre-completed) | Built | Verify separately | Needs a fresh-account first-run pass |
| Telegram alert delivery | Untested | Partial (backend hooks; no first-class UI) | Finish or hide | Settings asks for chat ID but delivery is unverified |

**Live-data layer:** Kite token invalid in production (`access_token_valid: false`, TokenException 403, stream disconnected, 0 subscribers). EOD pipeline current (bhavcopy 2026-06-09 ingested, 3,123 symbols). Data-health JSON also reports `status: success` for the last bhavcopy alongside a stored 404 `error_message` — confusing provenance reporting worth cleaning up.

---

## 2. UI/UX audit

Audited 2026-06-10 on production (desktop 1440px, tablet 768px, mobile 390px), benchmarked against TradingView and Chartink. Overall: **~80% production-ready on desktop; mobile needs dedicated layouts.** Fix #1–3 before soft launch; #4–6 before a public marketing push; #7–10 are post-M4 polish.

### Top 10 design problems (ranked by impact)

| # | Page / component | Problem | Fix |
|---|---|---|---|
| 1 | **Scanner — empty state** | Pre-scan state shows "No stocks matched … report if this looks like a data issue" before any scan ran; failure language without user action (compounds the P0-1 false-DOWN bug) | Positive instruction pre-scan ("Select a preset or add filters to scan NSE/BSE equities" + hint to presets); reserve "No stocks matched" strictly for genuine zero-result scans |
| 2 | **Nav — hidden critical surfaces** | Data Status buried in small gray top-right text; Upload absent from Journal page; Portfolio absent from the 4-item nav | Persistent data-freshness badge in top nav ("✓ EOD 2026-06-09", clickable); "Upload CSV" as secondary action on Journal; decide Portfolio placement (matches P1-2) |
| 3 | **Spacing system** | Padding varies 8–24px without a scale: Dashboard generous, Scanner sidebar cramped (8px preset stacking), Watchlist 3-column squeezed at 1440px | Adopt an 8/12/16/24/32/48px scale; bring Scanner sidebar to Dashboard card padding (20–24px presets, 16px filter sections) |
| 4 | **Dashboard density** | 12+ equal-weight cards on load; no visually dominant element, intended hierarchy (Workflow → Pulse → Breadth) lost | Make "Today's workflow" visually dominant (size or accent); collapsible Market pulse / Sector breadth; differentiate heading scale |
| 5 | **Mobile charts** | Desktop-shrunk at 390px: sidebar eats ~30% width, 13 timeframe buttons crowd the toolbar, canvas ~260px | Sidebar → drawer below 640px; scrollable timeframe strip; full-width canvas; 3–4 controls visible, rest in "More" |
| 6 | **Landing hero** | Screenshot small, low-contrast dark-on-dark, no "wow" feature visible | 2x larger annotated visual (chart + plan + journal card) or 10s loop of scan→watchlist→chart→journal; lift with glow/border |
| 7 | **Dark-theme contrast (a11y)** | Secondary gray ~4.5:1 (AA only); disabled buttons indistinguishable from placeholders; 1px focus ring barely visible | Bump secondary text to ~#9CA3AF; 2px high-contrast focus ring; disabled = opacity + tooltip, not just gray |
| 8 | **Button states** | Selected vs hovered presets identical (same blue); "Latest session" disabled twice with no explanation; icon buttons lack tooltips | Distinct treatments (selected = fill, hover = border, disabled = 50% + reason tooltip); tooltips on all icon-only buttons |
| 9 | **Scanner filter disclosure** | All 8 categories / ~40 inputs visible at once; decision paralysis vs Chartink's "Most Used first" | 4–5 essential filters expanded by default; rest under "Advanced"; add "Reset to preset defaults" |
| 10 | **Typography scale** | H2→H3 gap only 4px; pages read "flat" | Type scale 16/20/24/32px with weight spread 400–700; slight tracking on H1/H2 |

### What's already good

1. **Dark theme execution** — palette is professional, not over-contrasty; landing gradient tasteful
2. **Navigation consistency** — 4-item nav always visible, clear active state; better than burying Scanner in a submenu
3. **Honest empty states on Journal and Watchlist** — helpful, no false failure language (Scanner is the exception, #1)
4. **Scanner filter taxonomy** — 8 conceptual categories map to how swing traders think; beats Chartink's alphabetical chaos
5. **Landing copy** — "A process the product remembers" five-step frame is a genuine differentiator vs TradingView's feature grid

### Mobile/responsive verdict

Functional but desktop-shrunk where it matters. Landing and Dashboard adapt cleanly (hamburger + vertical stacks). Watchlist degrades acceptably to list-only but transitions jarringly at 768px (consider bottom-sheet chart preview). Scanner's full filter panel is unusable at 390px — needs a preset-chip mobile mode. Charts fail mobile outright (~260px canvas) and need a mobile-first redesign: full-width canvas, bottom toolbar, sidebar drawer. Prioritize mobile charts + scanner presets; Dashboard/Watchlist are good enough for now.

**vs TradingView:** clearer workflow guidance, weaker visual hierarchy, spacing, and mobile chart UX. **vs Chartink:** better filter taxonomy and empty states; Chartink's sortable inline-action results table is more scannable.

---

## 3. Competitive positioning

### Feature/price matrix (●● strong, ● basic, ○ absent; prices = effective Indian paid tier)

| Capability | TradingView | Chartink | ChartsMaze | Screener.in | Tradezella | TraderSync | Zerodha Kite | Upstox | **AlphaVyuh** |
|---|---|---|---|---|---|---|---|---|---|
| Charting | ●● best-in-class | ● basic | ● basic | ○ | ○ | ○ | ●● | ●● (TV-embedded) | ● EOD planning charts |
| Technical scanning | ● weak for NSE multi-condition | ●● India's best | ●● w/ backtest | ○ | ○ | ○ | ○ | ● | ●● EOD SEPA/VCP presets + RS score |
| Fundamentals | ● | ● thin | ● thin | ●● deepest in India | ○ | ○ | ● | ● | ● daily PE/mcap, quarterly "as of" |
| Journaling | ○ | ○ | ● manual, free | ○ | ●● AI | ●● AI | ● manual tags | ○ | ●● auto-journal from broker fills (target) |
| AI trade feedback | ○ | ○ | ○ | ○ | ●● Zella AI | ●● Cypher | ○ | ○ | ●● (M7 target; local stats today) |
| India broker integration | ● partner trading | ○ webhooks | ○ | ○ | ○ none | ○ none | ●● is the broker | ●● is the broker | ●● Kite/Upstox adapters |
| Backtesting | ●● | ● repaints | ● | ○ | ●● | ●● | ○ | ○ | ○ deferred (correct) |
| Alerts | ●● | ●● SMS/webhook | ● | ● | ○ | ○ | ● | ● | ● EOD scan + price |
| Community | ●● | ●● 200k scans | ○ | ● | ● | ● | ●● | ○ | ○ post-MVP (correct) |
| Effective price/mo | ₹1,295–4,995+GST | ₹780 | ₹499 | ₹417 | ≈₹2,000–4,000 | ≈₹1,400–6,700 | ₹0 | ₹0 | **₹1,999 today — see pricing note** |
| INR billing | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ Razorpay |

### Where AlphaVyuh can win

1. **The closed loop itself.** The documented Indian workflow is "scan on Chartink → analyze on TradingView → execute on broker" plus an Excel journal that ~87% abandon. Nobody links which setup produced which trade and whether that setup makes money *for this trader*. Structurally hard for incumbents to copy: Chartink has no broker link, TradingView no Indian journal, Zerodha no scanner and no multi-broker incentive, Tradezella no India.
2. **India-priced auto-journaling.** The only AI journals (Tradezella $288–399/yr, TraderSync $197–480/yr) have zero Indian broker support, wrong STT, no lot sizes. TradesViz's Zerodha "auto"-sync requires manual daily re-auth. A true auto-journal with correct Indian charges at an INR price has no direct competitor.
3. **Setup-tagged EOD scans with an honest RS score.** Chartink cannot screen Minervini's RS-ranking criterion (community guides say so explicitly); VCP confirmation is manual everywhere. AlphaVyuh's `rs_score` + `vcp_contraction` is a real edge — *if* RS calibration (still alpha) lands before public claims.
4. **Trust posture as marketing.** TradingView's top complaint corpus is billing traps; Chartink's backtest silently repaints; Upstox lacks outage disclosure. "Real data or a clear unavailable state" is a sellable brand promise — which is exactly why the scanner false-DOWN bug (§1) is intolerable.
5. **The Zerodha window.** Zerodha told its forum journal analytics is "in our todo / WIP" (TradingQnA, Feb 2026). Ship the journal loop before Console does; even then Console will be Zerodha-only and tag-based.

### Where NOT to fight

- **Realtime charting depth** vs TradingView/Upstox (Pine Script, second bars). The chart is a planning surface, not the product.
- **Intraday tick scanning** vs Chartink Premium — day-trader feature, wrong persona.
- **Fundamentals depth** vs Screener.in — decade-long data moat; position as complement.
- **Execution/brokerage** vs Zerodha/Upstox — they are the rails; be broker-neutral Switzerland.
- **General backtesting** vs TradingView/TraderSync — the journal's forward loop on real trades is the differentiated substitute.
- **Community scan libraries** vs Chartink's 200k scans — curate ~10 excellent presets instead (ADR 013 already mandates this).

### Pricing note (owner decision)

Community willingness-to-pay clusters at **₹400–800/mo or ₹3,300–8,500/yr** (Chartink ₹780/mo, ChartsMaze ₹499/mo / ₹3,299/yr, Screener.in ₹4,999/yr). Research recommendation: **Pro at ₹599/mo, ₹4,999/yr taxes-inclusive** (mirrors Screener.in's accepted annual anchor, undercuts Chartink, 4–8× cheaper than US journals), with a free tier (limited preset scans, 1 watchlist, manual journal) because the no-trial policy is Tradezella's single most-cited complaint. Current ₹1,999/mo Pro / ₹4,999/mo Elite is far above the validated band. Re-rate before public paid launch; consider a later ₹999–1,199/mo tier once live order routing ships.

---

## 4. Community insights (with sources)

1. **VCP/Minervini preset demand is proven.** Chartink's community hosts dozens of popular Trend Template and VCP scans; Indian blogs publish Minervini-on-Chartink walkthroughs and note RS-ranking *cannot* be screened there (pro-setups.com; chartink.com community scans).
2. **The VCP last mile is manual everywhere** — guides say "review each chart individually for VCP formation" (finermarketpoints.com). Automated `vcp_contraction` is a genuine differentiator if trustworthy.
3. **EOD is enough for this persona.** Indian tool roundups slot EOD scans as adequate for swing/positional; 1-min refresh is an intraday upsell (technicalanalysissoftware.com). Don't apologize for EOD-first.
4. **Journal demand is loud on Zerodha's own forum.** TradingQnA thread (Feb 2026) asks for win rate, strategy-wise P&L, equity curve, drawdown; staff: "in our todo and WIP" (tradingqna.com/t/trading-journel/191447).
5. **US journals fail Indians**: "wrong STT rates, no broker import, no F&O lot sizes" (TradingQnA EdgeLog thread). Excel journaling takes ~15 min/day and is overwhelmingly abandoned (arthalearn.com, onetradejournal.com).
6. **Even "auto-sync" India journals aren't automatic**: TradesViz requires manual daily re-auth because Kite clears sessions daily (tradesviz.com blog). The same Kite token-expiry constraint applies to AlphaVyuh (already an M4 TODO) — it is the make-or-break engineering detail for the "auto" claim, and today's prod TokenException is a live demonstration.
7. **Price sensitivity is real**: Indian traders "drop paid services that do not provide a clear edge" (multibagg.ai); ₹499/mo is the defended app-price norm in Indian journaling content (onetradejournal.com).

---

## 5. Prioritized action plan

Effort: S (<1 day), M (1–3 days), L (1–2 weeks), XL (>2 weeks).

### P0 — Broken / trust (do before anything else)

| # | What | Why | Effort | Competitor gap closed |
|---|---|---|---|---|
| P0-1 | Fix scanner false "DATA API DOWN": frontend must key scan availability off the EOD/scan health (verified healthy), not the live-quote/stream status; never disable Run scan + show neutral empty state when the scan API is up | The discovery engine is dark for users while backend is healthy; direct trust-invariant violation | M | None — table stakes; protects the Chartink-alternative claim |
| P0-2 | Make unavailable vs empty states unambiguous on scanner (and audit all surfaces): "Scanner is temporarily unavailable. Check Data Status…" vs true zero-match copy | Trust invariant; QA could not distinguish outage from empty result | S–M | Trust posture vs Chartink/TradingView |
| P0-3 | Fix Data Status reachability: dashboard "Open data status" path resolved to a 404 (`/data-status` vs `/data`) in production | The canonical "can I trust the data?" surface must never 404, especially while a DOWN banner shows | S | Trust posture |
| P0-4 | Alerts page: replace indefinite "Loading scan alert queue..." / "Waiting for latest EOD data." with timeout → final empty/error state | Indefinite spinners read as broken; violates copy patterns | S | — |
| P0-5 | Restore/rotate the Kite live token + decide the no-token UX: when live feed is down, show "EOD data current as of 2026-06-09; live quotes unavailable" rather than any DOWN messaging | Live token is invalid in prod today (TokenException 403); EOD-first product must degrade gracefully | S (ops) + M (UX) | Reliability vs Upstox expiry-day complaints |

### P1 — Competitive table stakes

| # | What | Why | Effort | Competitor gap closed |
|---|---|---|---|---|
| P1-1 | First-run onboarding verification pass (fresh account) + fix what breaks | QA couldn't test it; broken first-run kills conversion | S (test) + ? | — |
| P1-2 | Surface or remove hidden routes: add Upload and Data Status to nav; decide portfolio/multi-chart placement | Built features invisible in a 4-item nav scored as "absent" in QA | S–M | Discoverability vs Kite/Chartink |
| P1-3 | Scanner post-fix polish: verify result density, sorting, saved-screen flow, save-as-alert end-to-end on production | These were untestable while the DOWN banner blocked runs | M | Chartink parity on the EOD slice |
| P1-4 | Billing page next-step guidance while checkout is gated ("request access" path) | Honest banner exists but dead-ends the user | S | TradingView billing-trust contrast |
| P1-5 | Data provenance cleanup: bhavcopy record showing `status: success` alongside a stored 404 `error_message`; indicator-coverage gaps (ema_200 missing on 407 symbols) surfaced honestly in Data Status | Confusing provenance erodes the trust story | S–M | — |
| P1-6 | Finish or hide Telegram alerts (settings collects chat ID; delivery unverified) | Half-features read as broken | S (hide) / M (finish) | Chartink webhook/SMS alerts |
| P1-7 | Pricing decision per §3 (owner): re-rate Pro toward the ₹500–800/mo band before public paid launch | ₹1,999/mo is 2.5–4× the validated band | S (decision) | ChartsMaze/Chartink price anchors |

### P2 — Differentiation (the wedge, in ADR 013 order)

| # | What | Why | Effort | Competitor gap closed |
|---|---|---|---|---|
| P2-1 | Verify Kite postback/webhook mechanism (open M4 TODO) — the feasibility gate for true auto-journal | "Auto" is the wedge's hardest and most defensible claim; TradesViz fails exactly here | M (research/spike) | Tradezella/TraderSync/TradesViz |
| P2-2 | M5 auto-journal: broker fills → journal entries with correct Indian charges, zero manual entry | The wedge; Zerodha's journal is manual tags, US tools have no India | XL | Everyone |
| P2-3 | M6 setup tagging + per-setup stats (win rate, R:R distribution, hold time, equity curve) | Exactly what the TradingQnA thread asks Zerodha for | L | Zerodha Console (pre-empt), Tradezella |
| P2-4 | Chart snapshot at order/plan entry stored with journal (ADR 014) | Reviewing a past trade needs the chart as it was | M–L | No Indian competitor has this |
| P2-5 | M7 AI insights v1: LLM summary over journal corpus + setup-adherence scoring (upgrade the existing local-stats engine) | The paid retention mechanic; compounds with history | XL | Tradezella Zella AI, at Indian price |
| P2-6 | RS score calibration + published methodology | Pre-req for marketing the Chartink RS gap | L | Chartink |
| P2-7 | Pricing-page comparison block (Chartink / TradingView / Tradezella deltas) | Cheapest acquisition argument available | S | — |

### P3 — Polish

| # | What | Why | Effort |
|---|---|---|---|
| P3-1 | Design-audit fixes from §2 (consistency, density, responsive) | Top-tier fintech bar | S–M each |
| P3-2 | Decision-memory and review-queue copy tuning once real journal data flows | Wedge UX quality | S |
| P3-3 | Re-run this full QA sweep after P0s land; add a Playwright spec asserting scanner unavailable-vs-empty copy | Regression-proof the trust fix | S–M |

### Sequencing

P0-1..5 are a single hardening sprint (≈1 week). P1-1..6 fit alongside. P2 follows ADR 013's M-numbering and should not start behind schedule because of scanner work — ADR 013 explicitly freezes scanner scope to bug fixes, which is what P0-1/P0-2 are.

---

## 6. Things to CUT

| Item | Why cut | Disposition |
|---|---|---|
| **Options page** (`/options` payoff calculator) | Audience mismatch (ADR 013 "specific temptations" table); partial with mock fallback; not in nav anyway | Remove route from product build; archive code |
| **Community page** (`/community`) | Read-only browse/upvote with no share flow wired; ADR 013 says not before ~500 users | Remove from product surface until wedge proves out |
| **Backtest** (API only) | ADR 013 year-1 rejection; no UI exists | Keep API parked; build nothing |
| **Multi-chart board** (`/charts`) | Overlaps watchlist chart review; unclear job | Fold useful bits into watchlist or remove |
| **Telegram chat-ID field** (if delivery isn't finished in P1-6) | Half-built settings invite distrust | Hide until delivery is verified |
| **Elite tier on billing page** (₹4,999/mo with "advanced features later") | Selling a placeholder; conflicts with pricing posture in §3 | Hide tier until it has real contents (owner decision) |
| **Agents/mission-control + style-guide routes in prod** | Internal tooling reachable in the product app | Gate to admin/dev builds |

Everything else currently visible earns its place: dashboard breadth, scanner, watchlist/desk, charts, journal, alerts, settings, data status, feedback, upload.

---

## Appendix A — Verification evidence (redacted)

- Signed-in production QA via freshly provisioned pro-plan QA account (`qa.smoke@alphavyuh.local`), created with the CI smoke script; credentials sourced from Railway/Supabase env, never printed or committed.
- `GET /health` → 200. `GET /api/v1/data/health` (authed) → `status: healthy`, `latest_trade_date: 2026-06-09`, coverage 90.2%, `fallback_active: false`, live-market `access_token_valid: false` (TokenException 403).
- `POST /api/v1/scanner/run` (authed, `preset: trend_template`) → HTTP 200, `total_matches: 1000`, `trade_date: 2026-06-09`, ~7s.
- 15 QA screenshots + design-audit screenshots captured during browser sweeps (paths recorded in workstream reports; not committed).

## Appendix B — Blockers hit during review

- Onboarding first-run untestable (QA account pre-completed onboarding). Needs a disposable fresh account pass (P1-1).
- Broker OAuth, live orders, and Razorpay checkout untested by design (owner-gated).
- Scanner result-interaction flows (sorting, save-as-alert, send-to-watchlist) untestable while the false DOWN banner disabled runs; retest after P0-1 (P1-3).
