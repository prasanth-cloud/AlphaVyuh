# Spike: Kite postback vs server webhook for auto-journal

**Status:** Spike — 2026-06-10  
**Owner gate:** Do not claim auto-journal from broker fills until one path is verified in sandbox.

## Question

Can AlphaVyuh receive **server-to-server order/fill events** from Zerodha Kite Connect for auto-journal, or does Kite only support **client postback redirects**?

ADR 011 assumes a Kite order webhook → FastAPI → Postgres flow. CLAUDE.md lists this as an **M4 TODO** because Kite Connect documentation emphasizes postback URLs on order placement, not guaranteed server webhooks.

## What Kite documents today

| Mechanism | Direction | Typical use | AlphaVyuh need |
|---|---|---|---|
| **Postback URL** (`postback_url` on order) | Kite → user browser redirect | Show order status in the trading terminal after placement | Not sufficient alone — user must keep a session open |
| **WebSocket ticker / order updates** | Kite → connected client while session live | Live quotes and some order updates in connected apps | Requires persistent connection + daily access token |
| **Server webhook (assumed in ADR 011)** | Kite → backend HTTPS POST | Auto-journal when user is offline | **Unverified** — not clearly documented as a first-class Kite Connect feature |

## Findings (repo + docs review)

1. **Current broker router** (`backend/app/routers/broker.py`) creates journal entries on **order submit** (simulated or live-confirmed). Fill confirmation is not wired to a durable ingest path.
2. **No production webhook handler** for Kite order lifecycle events exists in this repo today.
3. **ADR 014** captures chart state at submit time — the snapshot reflects the **decision moment**, not the fill moment. Auto-journal still needs fill price/qty/time from broker events.
4. **Railway / FastAPI** can host a POST endpoint, but we must prove Kite will call it reliably before building M4 auto-journal UX copy.

## Recommended next steps (owner-gated)

1. **Sandbox experiment:** Place a test order with `postback_url` pointing at a RequestBin / staging FastAPI route. Record whether Kite hits the URL server-side or only via browser redirect.
2. **WebSocket fallback spike:** Hold a Kite WS session for 16+ minutes on Railway (ADR 011 hard constraint) and log order update packets.
3. **Decision matrix:**
   - If server POST works → implement `POST /api/v1/brokers/kite/postback` with signature validation + idempotent upsert to `broker_order_events`.
   - If postback-only → auto-journal requires either (a) user-connected WS while session open, or (b) periodic broker import sync — **not** silent auto-journal.
4. **Product copy until verified:** Journal remains **submit-time capture + broker import**; do not market "automatic fill journaling" without evidence.

## Out of scope for this spike

- Upstox/Dhan event delivery (separate broker quirks).
- Production credential storage or live order enablement.
- Full `broker_order_events` schema migration (track in M4 when path is chosen).

## Revisit when

- Kite sandbox test completes with captured HTTP logs.
- M4 broker integration PR opens — link the chosen event path in ADR 011 amendment.
