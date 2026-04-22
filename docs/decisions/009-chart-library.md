# ADR 009 — Chart Library Selection

**Status:** Proposed  
**Date:** 2026-04-21  
**Author:** Product team  
**Scope:** The charting component used across watchlist (`/watchlist`), chart detail (`/chart/[symbol]`), and any future chart surfaces.

---

## Context

AlphaVyuh currently renders OHLCV candlestick charts using **TradingView's lightweight-charts** (npm package `lightweight-charts`, v5.x, ~35 KB gzipped, Apache 2.0). The package renders high-quality candles with EMA overlays and handles resize/zoom well. It is already in production on the watchlist `MiniChart` component.

The watchlist redesign (ADR 007 Phase 2B) requires a full-featured chart surface: the right panel of the workspace must fill its container, support real-time tick updates, and — critically — expose **drawing tools** so traders can annotate trendlines, Fibonacci retracements, horizontal levels, rectangles, and text directly on the chart.

lightweight-charts has **zero built-in drawing tools**. The package exposes a canvas API for rendering series data but provides no primitives for user-drawn overlays, hit-testing, cursor feedback, or drawing state persistence. Building even a minimal set of drawing tools from scratch (trendline + horizontal + Fibonacci + rectangle + text) is a multi-week engineering effort — estimate 3–5 weeks for production-quality behavior on a hi-DPI canvas, touch targets, snap-to-OHLC, and undo/redo.

This ADR evaluates four options and selects one.

---

## Options Considered

### Option A — Build Drawing Tools on lightweight-charts

**What this means:** Extend `MiniChart.tsx` with a transparent SVG overlay (or second canvas) that intercepts pointer events. Implement each tool type as a stateful class: anchor points, drag handles, hit-testing, cursor changes, snap logic, style pickers, and persistence (drawings table already exists in Supabase).

lightweight-charts v5 (released April 2024) introduced a **Plugin API** that provides documented canvas primitives for third-party overlays. Community libraries such as `lightweight-charts-plugin-drawings` expose basic drawing tools via this API. This meaningfully lowers the floor for Option A compared to building entirely from the raw canvas.

**Pros:**
- No license risk — lightweight-charts is Apache 2.0
- No bundle size increase for the chart itself
- Full control over UI/UX conventions
- No watermark or attribution requirement
- Plugin API (v5+) provides documented canvas primitives — not a fully raw starting point

**Cons:**
- Community plugins are not production-grade: `lightweight-charts-plugin-drawings` lacks Fibonacci, text annotation, and snap-to-bar as of v5.x
- Even with plugins, bringing drawing tools to swing-trader quality (5–6 tool types, snap, style picker, undo) is ~2–4 weeks
- Hit-testing and zoom/pan coordination between plugin overlays and the base chart remains undocumented
- Becomes a maintenance surface that competes with product features for engineering time
- Rivals (Chartink, Screener.in) already ship native drawing tools; a custom build will lag in polish for months

**Verdict:** Plugin API reduces cost vs. raw canvas but does not eliminate it. Still 2–4 weeks to an adequate result. Acceptable only if no better option exists.

---

### Option B — Ship Without Drawing Tools (Defer)

**What this means:** Keep lightweight-charts as-is. Remove drawing tools from the MVP feature list. Traders can annotate externally (TradingView free, paper). Revisit after initial user cohort provides feedback.

**Pros:**
- Zero engineering cost
- Fastest time to market for the scan → watchlist → chart → journal loop
- Avoids premature optimization — drawing tool usage patterns are unknown

**Cons:**
- The primary user (SEPA/VCP swing trader) marks up charts as part of their process; it is not optional to them
- Competitive gap is immediately visible — every peer tool has drawing tools
- Deferred features rarely ship; "post-MVP" items accumulate
- Journal integration (screenshot a trade with drawings visible) becomes meaningless without drawings

**Verdict:** Acceptable only as a very short-term stopgap (4–6 weeks). Not acceptable as strategy.

---

### Option C — Switch to TradingView Charting Library (Advanced Charts)

**What this means:** Replace lightweight-charts with TradingView's proprietary **Advanced Charts** (formerly "Charting Library"). Accessed via a private GitHub repo (`tradingview/charting_library`), served statically from `public/charting_library/`, and wired to our OHLCV backend via a custom Datafeed API.

#### Licensing

- **Free tier** ("Advanced Charts"): requires attribution watermark ("Powered by TradingView"), approval by TradingView, and agreement to their terms. Intended for public-facing websites.
- **Ambiguity for subscription SaaS:** TradingView's public documentation says "public websites." AlphaVyuh is a subscription-gated product. This is a grey area. A direct email to `platforms@tradingview.com` is required before committing to this path. Response time is typically 2–5 business days. Precedent: Smallcase.com and Dhan's web terminal both use TV Advanced Charts with subscription gates — this is established Indian fintech precedent and is useful context for the licensing email.
- **Paid tier** ("Trading Platform"): adds brokerage UI (`IBrokerTerminal`, order placement, P&L overlay). Required if we want native order-from-chart flow. Pricing is not public — requires a sales call.

#### Drawing Tools

110+ built-in tool types in the free tier including every tool required for a swing trader's workflow:
- Trendline, ray, extended line, horizontal line, vertical line
- Fibonacci retracement, Fibonacci extension, Fibonacci channel
- Rectangle, ellipse, triangle
- Text annotation, callout, anchored text
- Pitchfork, Gann fan, Andrews' pitchfork

All tools include hit-testing, drag handles, snap-to-bar, style controls (color, line style, fill), and visibility toggles — all built in, zero custom code.

#### Datafeed Interface

The library uses a **Custom Datafeed API** (a JavaScript object implementing `onReady`, `searchSymbols`, `resolveSymbol`, `getBars`, `subscribeBars`, `unsubscribeBars`). It supports:
- REST-based historical data (map to `GET /api/v1/candles?symbol=...`)
- WebSocket or polling for real-time ticks (map to future real-time endpoint)
- Server-side tick feed using `subscribeBars` callback — no widget-internal polling

#### Bundle

The library is monolithic: ~7 MB (uncompressed), ~2.3 MB gzipped (approximate, based on v28–v30 measurements; verify against the actual v31.1.0 bundle after download). It **cannot** be webpack-bundled — it must be served from `public/charting_library/` with `<script>` tags. The `postinstall` script copies it from `node_modules` (private git dep) to `public/`.

#### Order Placement

Native broker UI (positions panel, order ticket, P&L on chart) requires the **Trading Platform** paid product. The free Advanced Charts has no `IBrokerTerminal` interface. However:
- Our order ticket is a custom overlay (the SELL/BUY panel in `ChartPanel`)
- We do not need TV's native broker UI — we render our own order form
- Therefore: **Advanced Charts (free) is sufficient for order placement via our own UI**

#### Active Maintenance

Latest release: v31.1.0, released April 8 2026. Actively maintained by TradingView with ~4 major releases/year.

**Pros:**
- 110+ drawing tools, zero custom implementation required
- Drawings are built-in; persistence to our `drawings` table is a thin serialization layer
- Industry-standard UX — traders already know how to use these tools
- Eliminates the largest open engineering risk in the product (weeks → hours)
- Real-time datafeed interface maps cleanly to our future WebSocket tick feed
- Order ticket remains our own UI, no paid tier required

**Cons:**
- Licensing ambiguity for subscription SaaS must be confirmed via email before proceeding
- ~2.3 MB gzipped additional bundle (chart page only, lazy-loaded)
- Integration effort: Datafeed adapter, symbol resolver, `postinstall` copy script (~1 week)
- Attribution watermark is permanent on the free tier — visible to all users
- Private git dependency creates a build-time secret (`GH_TOKEN`) requirement for CI/CD

---

### Option D — klinecharts (noted for completeness)

Apache 2.0, tree-shakeable, actively maintained. Evaluated against v9.8 (the current stable release as of April 2026). Includes ~35 built-in overlay types and basic drawing tool primitives (trendline, horizontal, vertical, segment). Missing: Fibonacci channel, Pitchfork, text annotation with callout, and snap-to-bar behavior equivalent to TV. No watermark.

Evaluated but not selected — drawing tool coverage gaps (Fibonacci channel, snap precision) are meaningful for the primary user's workflow. Worth re-evaluating post-launch if TV licensing does not resolve, particularly if klinecharts v10 ships Fibonacci channel support (listed on their roadmap).

---

## Decision

**Option C — TradingView Charting Library (Advanced Charts, free tier), conditional on licensing confirmation.**

The engineering cost savings (3–5 weeks of drawing tool work eliminated) outweigh the integration overhead (~1 week) and the bundle size increase. The watermark is acceptable given that it accurately represents the library in use and is standard in the industry. Order placement does not require the paid tier.

**Pre-condition:** Email to `platforms@tradingview.com` must receive written confirmation that AlphaVyuh's model (subscription-gated web app with TV attribution displayed) qualifies under the free Advanced Charts terms. Do not merge the watchlist redesign PR or begin the TV Charting Library integration until this confirmation is received.

If TradingView declines or does not respond within 10 business days: fall back to Option B (ship without drawing tools for 4–6 weeks) and revisit klinecharts and paid TV tiers simultaneously.

---

## Migration Plan

### Phase 1 — Licensing (1–2 days, non-engineering)
1. Email `platforms@tradingview.com` with: company name, product URL (alphavyuh.com), description of use (swing-trading analytics platform, subscription model, attribution displayed prominently)
2. Await written confirmation

### Phase 2 — Integration Spike (2–3 days, post-confirmation)
1. Get access to `github.com/tradingview/charting_library` (requires TV approval; comes with licensing response)
2. Add private git dep to `package.json`:
   ```json
   "charting_library": "github:tradingview/charting_library"
   ```
3. Add `postinstall` script to copy `node_modules/charting_library/` → `public/charting_library/`
4. Set `GH_TOKEN` secret in Vercel dashboard (frontend build only — Railway backend has no npm install step and does not need this token)
5. Add `public/charting_library/` to `.gitignore`

### Phase 3 — Datafeed Adapter (2–3 days)
1. Create `frontend/lib/charts/tv-datafeed.ts` implementing `IBasicDataFeed`:
   - `onReady`: return supported resolutions (`1D`, `1W`, `1M`)
   - `resolveSymbol`: call `GET /api/v1/candles/meta?symbol=` → return `LibrarySymbolInfo`
   - `getBars`: call `GET /api/v1/candles?symbol=&from=&to=&resolution=` → map to `Bar[]`
   - `subscribeBars` / `unsubscribeBars`: stub for now; wire to real-time feed in Phase 2C
2. Map our `CandleBar` type to TV's `Bar` type (field rename only, no computation)

### Phase 4 — Widget Mount (1–2 days)
1. Replace `MiniChart.tsx` with `TVChart.tsx`. Use the TypeScript definitions shipped in `charting_library/charting_library.d.ts` — do not use `any`. The widget constructor type is `IChartingLibraryWidget` from that definition file:
   ```tsx
   "use client";
   import { useEffect, useRef } from "react";
   // Type comes from charting_library/charting_library.d.ts (copied to public/ via postinstall)
   import type { IChartingLibraryWidget } from "@/public/charting_library/charting_library";
   import { createDatafeed } from "@/lib/charts/tv-datafeed";

   export default function TVChart({ symbol, height = 0 }: { symbol: string; height?: number }) {
     const containerRef = useRef<HTMLDivElement>(null);
     const widgetRef = useRef<IChartingLibraryWidget | null>(null);
     useEffect(() => {
       if (!containerRef.current) return;
       // TradingView is loaded as a global script before the page hydrates
       const widget = new window.TradingView.widget({
         container: containerRef.current,
         datafeed: createDatafeed(),
         symbol,
         interval: "D" as ResolutionString,
         library_path: "/charting_library/",
         locale: "en",
         disabled_features: ["header_symbol_search", "header_compare"],
         enabled_features: ["study_templates"],
         autosize: height === 0,
         height: height > 0 ? height : undefined,
       });
       widgetRef.current = widget;
       return () => { widget.remove(); widgetRef.current = null; };
     }, [symbol, height]);
     return <div ref={containerRef} style={{ width: "100%", height: height > 0 ? height : "100%" }} />;
   }
   ```
   Note: `window.TradingView` is declared in a global `d.ts` shim that extends `Window` — avoids `any` while matching the script-tag loading pattern.
2. Load the library script per-route using `next/script` with `strategy="lazyOnload"` — not `beforeInteractive`, which would block the entire page. The watchlist page renders a loading skeleton during the brief async delay:
   ```tsx
   <Script src="/charting_library/charting_library.standalone.js" strategy="lazyOnload"
     onLoad={() => setChartLibReady(true)} />
   ```

### Phase 5 — Drawing Persistence (1–2 days)

TV's drawing state is stored as a proprietary JSON blob via `widget.save()`. The existing `drawings` table has structured columns (`tool_type`, `points`, `style`, `timeframe`) designed for our own schema. These are incompatible with TV's blob format — storing the blob in `style` would silently break existing queries.

**Decision:** Add a new migration (`016_tv_chart_state.sql`) with a dedicated column:
```sql
alter table public.drawings add column tv_state jsonb;
```
Store TV's blob in `tv_state`. Leave structured columns intact for any future library-agnostic path.

1. Write migration `016_tv_chart_state.sql`
2. On `widget.onChartReady()`, call `widget.load(savedState)` from Supabase (keyed by `user_id + symbol`)
3. On `widget.subscribe("drawing_event", ...)`, call `widget.save(state => upsertTVState(symbol, state))` via `lib/api.ts`
4. `upsertTVState`: `POST /api/v1/drawings/tv-state` — upserts `{ symbol, tv_state }` for the current user

### Phase 6 — Watchlist PR Completion (1 day)
1. Pop stash on `feat/watchlist-tradingview-redesign`
2. Replace MiniChart usage with TVChart
3. Wire symbol selection to widget's `chart.setSymbol()` API (no re-mount on symbol change)
4. Run typecheck, lint, Playwright spec

---

## Rollback

If TV Charting Library integration is started but later abandoned (licensing revoked, TV changes terms, prohibitive cost), the fallback is:
- `TVChart.tsx` is a drop-in replacement for `MiniChart.tsx` with the same props interface (`symbol`, `height`). Reverting the watchlist to `MiniChart` is a one-file swap.
- lightweight-charts remains in `package.json` until TV integration is fully validated and merged
- `016_tv_chart_state.sql` migration adds a nullable column — removing it is a non-breaking migration
- Drawing tools revert to Option B (deferred) — no user-facing regression, since drawings were not previously available

---

## Open Questions for Reviewer

1. **Licensing:** The migration plan prescribes sending the email before writing any integration code. Should we also prepare a paid-tier cost analysis in parallel so we can pivot quickly if the free tier is denied? The paid tier has no public pricing — a sales conversation could take weeks.

2. **Bundle loading:** Because the TV library cannot be webpack-bundled, `dynamic(() => import(...), { ssr: false })` does not apply — the library loads as a raw `<script>` tag. The `strategy="lazyOnload"` approach in Phase 4 is the correct architecture from day one. The `chartLibReady` gate (state set in `onLoad`) is the skeleton-screen pattern during the 1–3s load window. **This is decided — not an open question.** If Lighthouse scores degrade unacceptably, the mitigation is preloading the script on the `/watchlist` route using `<link rel="preload">` in the layout.

3. **Drawing persistence format:** Resolved in Phase 5 above: `tv_state jsonb` column via migration `016`. The open question that remains: if we ever switch away from TV Charting Library, do we invest in a parser that converts `tv_state` blobs to our structured schema? Recommendation: defer until there is a concrete reason to switch.

4. **GH_TOKEN CI secret:** The private git dep requires a GitHub token with `read` access to `tradingview/charting_library` at build time. Is this token scoped to the repo or org? Who on the team holds it? What's the rotation plan?

5. **klinecharts fallback:** If TV licensing is denied, klinecharts is the next candidate. Should we spike a klinecharts integration in parallel (on a separate branch) so we have a ready fallback, or is the 10-business-day wait short enough that we can assess then?

6. **Order ticket:** The current `ChartPanel` SELL/BUY overlay is custom HTML. After TV integration, should the order ticket be positioned inside the TV widget container (floating overlay using `position:absolute`) or external to it? External avoids z-index conflicts but breaks the "order on chart" mental model.
