# ADR 011 — Realtime Architecture (Live Prices + Order Events)

**Status:** Accepted — Option C (hybrid) for M4  
**Date:** 2026-04-23  
**Scope:** Live price delivery to the chart; order status event delivery; M4 (Zerodha Kite, single broker, single chart)

---

## Context

### What needs real-time data

| Feature | Update frequency needed | Notes |
|---|---|---|
| Chart — currently-viewed symbol | Live ticks (~1s) | Only the one symbol visible in the chart |
| Order placement — price at submission | Single fetch at click time | REST quote is sufficient; WS not required |
| Order status — submitted → executed → filled | Event-driven, seconds | Different problem from prices; see below |
| Watchlist rows (not the active chart) | Every 5–15s acceptable | Poll; no WS required |

### What explicitly does NOT need real-time

Scanner (EOD), dashboard sector breadth (EOD), journal (historical), watchlist rows not in the active chart.

### Hard constraints

**Kite Connect WebSocket limits:**
- Maximum **3 concurrent WS connections per API key**
- Up to ~3,000 instruments per connection
- Each user's WS connection requires *that user's* `access_token` from the Kite OAuth flow — there is no "master" subscription shared across users; each user is a separate API key identity

**Plan gate:**
- Free users: no live ticks; 15-minute delayed data via Kite's REST quote endpoint, cached for 15 minutes
- Premium users: live ticks on the active chart

**Railway WS reality (verified 2026-04-23):**
- Supports persistent WebSocket connections natively; no config needed
- **No sticky sessions** — Railway does not support session affinity across replicas
- **15-minute hard connection timeout** — heartbeat pings every 20–30s are mandatory to keep connections alive
- Cost: approximately $20–50/month for ~100 concurrent WS connections at the FastAPI relay layer (single-replica). This estimate is valid at ≤100 concurrent premium users; revisit the cost model before scaling past that threshold.

---

## Options Evaluated

### Option A — Client holds WebSocket (browser → Kite direct)

Each browser tab opens its own Kite WebSocket using the user's `access_token`.

**Flow:** `browser ──WS──► Kite servers`

### Option B — Backend fan-out via FastAPI WebSocket

The FastAPI backend (Railway) holds one WS per user to Kite and exposes a relay WS endpoint to the browser.

**Flow:** `browser ──WS──► FastAPI relay ──WS──► Kite servers`

### Option C — Hybrid: backend-held WS for prices + Supabase Realtime for order events

Live price ticks flow through the FastAPI relay (Option B). Order status changes are written to a `broker_order_events` table and broadcast via Supabase Realtime.

**Flow (prices):** `browser ──WS──► FastAPI relay ──WS──► Kite servers`  
**Flow (order events):** `Kite order webhook ──► FastAPI ──► Postgres ──► Supabase Realtime ──► browser`

---

## Decision Matrix

| Dimension | A | B | C |
|---|---|---|---|
| **Where does Kite access_token live** | Browser memory + network (client-side) | Backend memory only; never leaves server | Backend memory only; never leaves server |
| **Scaling ceiling** | 3 WS per user (Kite limit), per tab; 3 tabs = connection exhaustion per user | 1 WS per active premium user to Kite; backend relay has no hard cap from Kite's side | Same as B for prices; Supabase Realtime scales independently for events |
| **Infrastructure cost per additional premium user** | $0 (client-side) | ~$0.01–0.05/day per concurrent WS connection on Railway | Same as B + Supabase Realtime (included in Supabase plan for typical message volumes) |
| **Complexity to implement for MVP** | Low — browser WS API is simple | Medium — relay WS in FastAPI, reconnect logic on both ends | Medium-high — relay WS + Supabase Realtime subscription + `broker_order_events` table |
| **Upgrade path** | Hard to walk back: once access_token is in the browser, users/clients may depend on it; moving to server-side later is a breaking change | Straightforward to add multi-broker adapters at the relay layer (ADR 004 pattern) | Same as B; Supabase Realtime for events is already in the stack and doesn't constrain price delivery evolution |
| **What breaks if Railway restarts** | Nothing — browser handles its own WS | All open price WS connections drop; browser must reconnect; in-flight ticks during that window are lost | Same as B for prices; Supabase Realtime connections are independent of Railway restart |
| **What breaks on laptop sleep/wake** | Browser WS connection drops; OS TCP stack may not detect quickly; requires app-layer ping/reconnect | Browser WS to relay drops; relay's backend WS to Kite also eventually drops; both sides need exponential-backoff reconnect | Same as B for browser→relay; Supabase client handles its own reconnect automatically |
| **Free vs premium gate enforcement** | Frontend only — trivially bypassed by calling Kite WS directly with the token | Backend enforces at relay entry: checks plan before establishing or accepting subscription | Backend enforces at relay entry for prices; Supabase RLS enforces at DB level for order events |
| **Kite ToS / security posture** | Kite's own JS SDK supports browser-side WS, so it is technically permitted — but exposing access_token to browser increases theft surface (XSS, extensions, DevTools) | Access token never exposed to browser; cleaner posture | Same as B |
| **Multi-tab behavior** | 3 tabs = 3 Kite WS = connection exhaustion; 4th tab breaks | Backend relay deduplicates: all tabs for the same user share one relay session to Kite | Same as B |

---

## Decision: Option C

**Recommendation: Option C — Hybrid.**

The matrix supports this over the user's initial bias — it is not a compromise. The two concerns that rule out Option A are not stylistic:

1. **Access token in the browser is a hard security regression.** The M2 broker credentials ADR (ADR 002) established that credentials never leave the backend. A Kite access_token is credential-equivalent — it authorizes order placement. Putting it in the browser contradicts ADR 002's model and is not recoverable once deployed (users who cache or log the token will retain access even after rotation).

2. **Multi-tab connection exhaustion is a real user scenario.** A swing trader with a scanner tab, a chart tab, and a phone (mobile browser) open simultaneously hits Kite's 3-connection limit. Option A has no mitigation; Options B and C do (backend relay deduplicates by user).

**Why C over B alone:** Order status events and live prices have different profiles. Prices are high-frequency, low-latency, ephemeral (a missed tick is fine). Order events are low-frequency, medium-latency, but must be durable (a missed "FILLED" event causes a UI inconsistency the user will notice). Supabase Realtime handles durability semantics naturally via Postgres — the event is committed before broadcast. Trying to deliver order events over the same price WS would require implementing durability at the application layer, which is reinventing what Supabase already provides.

---

## M4 Scope (Minimum Viable Implementation)

### What is in scope for M4

**Live prices (Option C / price path):**
- `GET /api/v1/ws/prices?symbol=RELIANCE` WebSocket endpoint on FastAPI
- On connection: verify JWT, check plan = premium; reject with 4003 if free
- Establish (or reuse) one Kite WS per user using the stored access_token from `broker_credentials`
- Subscribe the requested symbol on the user's Kite WS
- Relay ticks to the browser WS at Kite's native tick rate (~1/s for LTP mode)
- On browser disconnect: unsubscribe the symbol; close Kite WS if no remaining subscriptions for that user
- Heartbeat ping every 25s from backend to browser; browser echoes pong. This covers two separate timeout risks: Railway's 15-minute hard connection limit, and AWS ALB / intermediate proxy idle-connection timeouts (typically 60s). A 25s ping beats both. Whether Railway's 15-min limit applies to WS upgrades (vs HTTP only) must be verified empirically during M4 integration testing — if WS connections are exempt, the heartbeat can be relaxed but should remain for proxy resilience.
- Reconnect: if Kite WS drops, backend attempts exponential backoff (1s, 2s, 4s… cap 60s); browser shows "Reconnecting…" state. Ticks during the reconnect window are dropped — the chart freezes at the last known value. This is acceptable for swing traders (missed a tick, not a trading decision), but the chart must show a visual staleness indicator (e.g., amber dot) rather than appearing live while disconnected. If reconnect exceeds 10s, fall back to the REST quote endpoint on a 5s poll until WS is restored.

**Delayed prices for free users:**
- `GET /api/v1/quotes/{symbol}` REST endpoint
- Backend calls Kite's REST quote API; caches result for 15 minutes in Railway's in-memory cache (or Redis if already provisioned)
- Frontend polls this endpoint every 15 minutes for free users

**Order events (Option C / event path):**
- New table: `broker_order_events` (symbol, broker_order_id, status, filled_qty, avg_price, timestamp, user_id)
- RLS: users read their own rows only
- Kite order status webhook → FastAPI route → upsert into `broker_order_events`
- Frontend subscribes to Supabase Realtime on `broker_order_events` filtered by `user_id = auth.uid()`
- On event: update order status UI

**Symbol switching on the chart:**
- When user navigates to a new symbol: browser sends close signal on old WS, opens new WS for new symbol
- Backend unsubscribes old symbol, subscribes new one on Kite WS (or re-uses if already subscribed)

### M4 Infrastructure Constraint: Single-Replica Required

**Railway must be configured to run a single instance during M4.**

Option C holds per-user Kite WS connections in the FastAPI process's in-memory state. If Railway auto-scales to two replicas, a user's browser WS may connect to replica 1 while their Kite WS (and its tick stream) lives on replica 2. Ticks would never arrive at the browser. This is a correctness failure, not a performance concern.

**Hard gate before M4 ship:** Disable Railway auto-scaling. Set `numReplicas: 1` (or equivalent) in the Railway service config and document it in the deployment runbook. Do not enable auto-scale until Redis pub/sub fan-out is implemented (planned for M5 — Redis holds the tick stream; any replica can serve any browser WS by subscribing to the Redis channel for that symbol).

This is not a hypothetical M5+ problem. Railway may restart or deploy a new replica at any time (deploys, crash recovery). The single-replica constraint must be enforced before M4 launches to paying premium users.

### What is explicitly out of scope for M4

| Feature | Target milestone |
|---|---|
| Multi-symbol WS (multiple charts visible simultaneously) | M5 |
| Redis pub/sub fan-out (enables multi-replica Railway) | M5 |
| Upstox / Dhan broker WS adapters | M6 |
| Historical tick storage (for backtest/replay) | M7 |

---

## Plan Gate Enforcement

The free-vs-premium gate must be enforced at two layers:

1. **Backend (authoritative):** FastAPI `GET /api/v1/ws/prices` checks the user's plan via `plan_cache` before upgrading the connection. Returns HTTP 403 before the WS handshake if plan = free. The `plan_cache` (60s TTL) is an intentional product tradeoff — a user who just upgraded may receive live ticks up to 60s late; a user who just downgraded may receive live ticks up to 60s longer than their plan allows. Both are acceptable. `plan_cache` must never be seeded from user-supplied input; it is only populated from `_get_user_plan()` (DB read) or the verified payment path after `plan_cache.invalidate(user_id)`.

2. **Frontend (UX only):** Show a "Upgrade for live prices" prompt for free users rather than attempting the WS connection. This is not a security gate — it is purely UX.

Never rely on the frontend gate alone. A user who bypasses the frontend would hit the backend gate and get HTTP 403.

---

## Broker-Agnostic Abstraction (M6 Consideration)

The M4 implementation will be Kite-specific at the WS relay layer. To prepare for M6 (Upstox, Dhan):

- The relay logic that speaks to Kite (`kiteconnect.KiteTicker`) must live entirely in `backend/app/brokers/kite/realtime.py`
- The FastAPI route at `/api/v1/ws/prices` calls a broker-agnostic interface: `get_realtime_adapter(user_id) → RealtimeAdapter`
- `RealtimeAdapter` ABC (in `backend/app/brokers/adapter.py`) defines: `subscribe(symbol)`, `unsubscribe(symbol)`, `on_tick(callback: Callable[[TickEvent], None])`, `close()`
- `TickEvent` is a dataclass with fields: `symbol: str`, `ltp: float`, `timestamp: datetime`, `bid: float`, `ask: float`, `volume: int`. M6 adapters must populate all fields; fields unavailable from a given broker's WS should be `None` (typed as `Optional`). The relay route passes `TickEvent` directly to the browser as JSON.
- M6 adds `UpstoxRealtimeAdapter(RealtimeAdapter)` and `DhanRealtimeAdapter(RealtimeAdapter)`

This mirrors the existing `BrokerAdapter` pattern from ADR 004. The WS relay route does not change between M4 and M6; only the adapter implementation swaps.

**`subscribeFills` in `frontend/lib/brokers/adapter.ts`:** The TypeScript adapter contract currently includes a `subscribeFills` method. Under Option C, order fill events flow through Supabase Realtime (not through the price WS), making `subscribeFills` on the frontend adapter a dead code path before it is ever implemented. Review and remove or re-scope this method before M4 implementation begins to avoid confusion about which channel delivers fill events.

---

## Open Questions (not blocking M4)

| Question | Owner | Deadline |
|---|---|---|
| Does Kite's webhook deliver order events fast enough for the UI (SLA < 2s)? | Verify during M4 integration testing | Before M4 ship |
| Should `broker_order_events` have a TTL/cleanup job, or is unbounded growth acceptable? | Engineering | Before M5 |
| Railway single-replica vs multi-replica: at what user count do we need multiple replicas, and how do we handle the no-sticky-sessions constraint? | Engineering | Before scaling past ~200 concurrent premium users |
| Does Railway's 15-min timeout apply to WebSocket upgrades, or only to HTTP? If WS connections are exempt, heartbeats may be optional. | Verify empirically in M4 | M4 integration test |

---

## Rejected Alternatives

**Option A (browser holds token):** Rejected. Access token exposed to browser contradicts ADR 002. Multi-tab exhaustion is a real failure mode. No upgrade path to server-side without breaking deployed clients.

**Option B alone (no Supabase Realtime for events):** Technically workable but forces order event durability onto the application layer. Supabase Realtime solves this without additional infrastructure. No reason to prefer B-only over C for M4.

**Redis pub/sub for price fan-out:** Evaluated as a future option for scaling beyond a single Railway instance. Out of scope for M4 given Railway's single-replica ceiling is well above the expected M4 user count. Revisit when concurrent premium user count exceeds 100.
