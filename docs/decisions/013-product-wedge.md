# ADR 013 — Product Wedge Decision

## Status

Accepted — 2026-04-23. Decided at end of M3 foundation work, before M4 begins.

---

## Context

### Where we are

M3 shipped a complete foundation:

- **Auth** (ADR 001): Supabase-backed, RLS on every table, session management working
- **Broker adapter** (ADR 004): TypeScript contract and Python ABC defined; Kite implementation underway
- **EOD scanner** (ADRs 005/006): 20+ filters, Momentum and SEPA presets live, VCP two-pass architecture proven, p95 latency within budget
- **Realtime architecture** (ADR 011): WS fan-out design complete, pending TradingView Charting Library license response
- **Design system** (ADR 012): Token set canonicalized, Tailwind aliases wired, Phase 2B applying to product screens

alphavyuh is pre-launch. Currently accessible to the founder and a small test group only. No paying users yet.

### The competitive landscape

The Indian retail trading tool market has three mature segments:

**Scanner tools** — Chartsmaze, Deepvue, Chartink. Deep filter sets, fast, polished. They've had years to accumulate features. Feature-for-feature parity would take years and produce a worse version of what already exists.

**Broker + chart terminals** — Zerodha Kite, TradingView India (via broker integrations). They own the order placement UX and have broker-level trust. We can integrate *with* them; we can't out-execute them on order routing.

**Strategy / automation platforms** — Tradetron, Stockmock. Algo-adjacent, options-heavy, different audience (day traders and quant-adjacent users, not systematic swing traders).

### The gap nobody fills

None of the above runs statistical analysis on a trader's *own* executed trades against their *own* stated setups.

Every tool above answers the question: "What should I look at?" or "How do I execute?"

Nobody answers: "Here's what your last 60 trades reveal about your discipline, your edge, and where you leak."

---

## Decision

**alphavyuh's primary product wedge is the AI-driven trade journal with closed-loop analysis. Scanner, broker integration, and community features are supporting infrastructure, not independent product directions.**

In practice, "supporting infrastructure" means: the scanner is feature-frozen as of M3. Future scanner work is bug fixes and performance only — no new filter categories, no new presets, no UX overhaul. Any proposed scanner change that goes beyond bug fixes requires a new ADR that explicitly falsifies revisit condition 1 first. Without that, the answer is no.

### Why this wedge

**Audience fit.** The target user is a systematic swing trader running a Minervini SEPA or Qullamaggie VCP playbook. They *already have a process*. What they lack is an honest mirror: are they following it? Where does discipline break down? Which setups work for *them* specifically versus for Minervini in a different market regime?

**Monetization logic.** A ₹100/month subscription is justified by insights that compound in value as trade history grows. Month 1 might surface one useful insight. Month 12 surfaces patterns across hundreds of trades. The longer a user stays, the more valuable the product becomes — a retention mechanic that scanner tools don't have.

**Asymmetry.** Every serious retail trader already has a scanner. Most use TradingView or Chartsmaze. We can't win that race. But nobody in the Indian market serves "systematic trader wanting their own process analyzed." That is the white space. The wedge doesn't compete with Chartsmaze; it makes Chartsmaze less necessary because the *journal feedback* becomes the workflow anchor.

---

## What we ARE building (M4–M7, ~3 months)

### M4 (weeks 1–6) — Chart + order placement

- TradingView Charting Library integration (when licensed)
- Backend WS fan-out per ADR 011 spec
- Order ticket component (size, limit/market, SL, target)
- Order status via Supabase Realtime
- **Chart snapshot at order entry, stored with the journal entry.** This is not a "chart feature" — it is a journal-wedge feature. A trader reviewing a past trade needs to see what the chart looked like at entry, not what it looks like today. This ships with M4, not deferred.

### M5 (weeks 7–8) — Portfolio sync + auto-journal

- Kite holdings, positions, and completed orders API
- Auto-create journal entries from executed orders — manual entry becomes the exception
- Map broker order fields to journal schema (symbol, side, qty, price, datetime, order ID)

### M6 (weeks 9–10) — Setup tagging + basic stats

- User-defined setup types (VCP, breakout, pullback, gap-up, etc.)
- Tag each trade at entry (or retroactively)
- Stats dashboard: per-setup win rate, R:R distribution, average hold time, cumulative P&L
- No AI yet — raw stats surfaced cleanly

### M7 (weeks 11–13) — AI insights v1

- Pattern detection engine (runs over the journal corpus)
- LLM-generated insight summary: "Based on your last 50 trades, here's what I noticed..."
- Setup adherence scoring: user defines their entry rules, system scores each trade, surfaces "trades that followed your rules outperformed trades that didn't by X%"
- First version will be imperfect. Ship it. Iterate based on user feedback.

**End state after M7:** A paying user gets insights no other tool in the Indian market provides. The value proposition is proven or falsified with real users.

---

## What we are explicitly NOT building (year 1 rejections)

### Scanner feature parity with Chartsmaze

The scanner shipped in M3 is the scanner for year 1. Full stop. There is no "add a few more filters" path that doesn't compound into scanner-feature-parity work. If the next thing on the roadmap is a scanner improvement and there is no journaling work queued behind it, the roadmap is wrong.

### Community scan library

Not before 500 active users. Community requires network effects to be useful; below that threshold it's a maintenance burden with no payoff. Building community infrastructure for a 5-person beta is misallocated effort. This is not "year 2 if things go well" — it is "year 2 after the wedge proves out." If the wedge doesn't prove out, community won't save the product anyway.

### Aggressive multi-broker expansion

Kite is implemented. Upstox and Dhan are deferred until user demand forces it. M4/M5 will make Kite-specific assumptions where necessary; this is acceptable tech debt. A working Kite integration that serves 90% of our target users is better than a half-working multi-broker abstraction that serves nobody.

### Execution automation and bot trading

SEBI regulations make this a legal and reputational minefield for a pre-launch product. Not in scope for year 1.

### Power-user infrastructure features

API access for programmatic journal queries, custom webhook alerts, a full backtest engine — these are year 2 if the wedge proves out. A backtest engine that serves *journal-based* hypothesis testing (e.g., "would my rule change have helped?") may arrive in year 2. A general-purpose backtest engine for the market is a different product.

### Specific temptations to resist

| Temptation | Why to refuse |
|---|---|
| Tick-level intraday scanner | Swing traders don't need it; day traders are a different audience |
| Options screener | Different audience entirely; fragments product focus |
| Multi-country markets | NSE/BSE only through MVP; no bandwidth for data sourcing, regulation, or FX |
| News/sentiment integration | Not the wedge; covered better by Bloomberg/ET/Pulse |
| General-purpose AI trading chatbot | Too broad; diffuses the value proposition |
| Social sharing of journal entries | Community risk + distraction; not what systematic traders want |

---

## Revisit conditions

This decision stands until demonstrably falsified by user feedback.

**Revisit if:**

1. **Scanner-value signal, measured:** In 30-day retention interviews covering at least 20 paying users after M7 ships, more than 60% cite scanner capability (not journal insights) as the primary value driver, AND churn analysis confirms that churned users at >30 days had lower journal engagement than retained users. Both conditions must hold. One data point — a vocal user, a spike in scanner API calls — does not constitute a revisit trigger.
2. **Insight shallowness, measured:** More than 40% of churned paying users (from a sample of at least 15 churned accounts) give "not enough unique value from insights" as the primary cancel reason in an exit survey. The survey must be asked explicitly; inferring this from support tickets doesn't count.
3. **Competitor timing, measured:** A well-funded competitor ships an AI journal product explicitly targeting NSE/BSE systematic traders **and** acquires 200+ publicly verifiable users within 90 days of launch. "Similar feature" from a general-purpose tool (TradingView journal widget, Kite notes) does not qualify — it must be a dedicated AI feedback loop aimed at this audience.

**Do NOT revisit for:**

- Users asking for scanner feature X — this is scope creep camouflaged as user feedback. Add it to a backlog, don't act on it.
- "Chartsmaze launched feature Y" — they will always have more scanner features. We win on the wedge, not feature count. If feature Y is journal-adjacent, evaluate it; if it's scanner-adjacent, ignore it.
- Engineer enthusiasm for a technically interesting problem that doesn't serve the wedge — log it for year 2.

**The friction gate:**

If you are reading this and you've already started building a scanner feature, community feature, or options screener without a new ADR: stop. Write the ADR first. It must address: (a) which revisit condition above you believe is now met, (b) the specific user data that meets the threshold, (c) what journal work gets deprioritized as a result. If you can't answer all three, the work shouldn't have started.

---

## Connection to prior ADRs

**ADR 006** defined scanner scope. The SEPA preset shipped in migration 033 is the last *named* scanner preset planned for year 1. Future scanner work is bug fixes and performance only — no new filter categories.

**ADR 011** designed realtime order event delivery. That architecture is not an M4 feature — it is journal-critical infrastructure. Order events that don't reach the journal make M5 impossible.

**ADR 012** canonicalized the design system. Journal screens receive the most design attention in Phase 2B because that is where paying users will spend the most time. Scanner and dashboard screens are functional; journal screens must be *good*.
