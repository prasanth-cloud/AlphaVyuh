# ADR 004 — Broker Adapter Language Split (TypeScript contract, Python implementation)

> Status: **ACCEPTED**

---

## Context

alphavyuh has a TypeScript/Next.js frontend and a Python/FastAPI backend. The broker
integration layer needs a well-defined contract (what methods exist, what types they
take and return) shared between both sides, and concrete implementations that actually
call broker APIs (Kite Connect, Upstox, Dhan).

During M2 scaffolding, the BrokerAdapter interface was written in TypeScript at
`frontend/lib/brokers/adapter.ts`. When broker credential storage was designed (ADR 002),
a Python backend was chosen as the credential holder — the frontend must never touch
broker API keys. This created a question: where do adapter implementations live?

---

## Decision

**Split the adapter into two layers:**

| Layer | Language | File | Role |
|---|---|---|---|
| Contract | TypeScript | `frontend/lib/brokers/adapter.ts` | Canonical type definitions — DTOs, method signatures, error model |
| Contract (mirror) | Python | `backend/app/brokers/adapter.py` | Python ABC mirroring the TS contract; all implementations subclass this |
| Implementations | Python | `backend/app/brokers/<broker>/` | Real broker API logic (Kite, Upstox, Dhan, Mock) |

The frontend TypeScript file is the **source of truth** for the shape. The Python ABC
mirrors it. Both must be kept in sync — any change to one requires a same-PR update to
the other.

---

## Rationale

### Why Python for implementations

1. **Credential security.** ADR 002 stores broker credentials encrypted in Supabase,
   decrypted only in the Python backend. `backend/app/brokers/credentials.py` is the
   single decryption point. All adapter implementations call this module — they cannot
   run in the browser.

2. **Token isolation.** `access_token` and `api_secret` must never travel to the
   browser. A Python implementation can use them in-process (backend memory) and
   return only business data (profile, holdings, order status) to the frontend.

3. **Backend infra.** APScheduler jobs (bhavcopy ingest, scan alerts) already run in
   the Python backend. Future streaming fill aggregation and position P&L updates will
   run there too.

### Why keep the TypeScript contract

1. **Already exists and was reviewed.** `frontend/lib/brokers/adapter.ts` was written
   and reviewed with significant care (branded types, generic order extensions,
   idempotency contract, fill deduplication). Discarding it loses those decisions.

2. **Frontend type-safety.** The TypeScript types define what the frontend API client
   can send and receive. The frontend routes (`/api/brokers/*`) speak these types.
   Removing them would require re-inventing them in a less expressive form.

3. **Documentation value.** The TS interface is the single most readable statement of
   "what a broker integration provides". Both frontend engineers and backend engineers
   read it. Keeping it canonical avoids drift.

### Sync cost

The main downside is that changes require updating two files in two languages. Mitigations:

- The ADR and both files' module docstrings state the sync requirement explicitly.
- PRs that touch either file are flagged for reviewer to check the other.
- The Python ABC is deliberately minimal (no business logic) — it changes only when
  method signatures or DTO fields change, which is infrequent.

---

## Implementation

### TypeScript (`frontend/lib/brokers/adapter.ts`)

Types-only. No implementation. A header comment states this and links to this ADR.
Frontend code imports these types for request/response shapes and for type-checking
API client calls. No adapter class is instantiated in the frontend.

### Python (`backend/app/brokers/adapter.py`)

Python ABC with `@abstractmethod` on every method. Pydantic `BaseModel` for all DTOs.
`NewType` aliases for branded types (`IdempotencyKey`, `BrokerOrderId`). `Literal` for
union string types (`BrokerId`, `OrderStatus`, etc.). Method names are snake_case
equivalents of the TS camelCase originals — semantics are identical.

### Naming convention

| TypeScript | Python |
|---|---|
| `getAuthUrl(state)` | `get_auth_url(state)` |
| `exchangeCode(code)` | `exchange_code(code)` |
| `getProfile(creds)` | `get_profile(creds)` |
| `placeOrder(creds, order)` | `place_order(creds, order)` |
| `brokerOrderId` field | `broker_order_id` field |
| `fromCache` field | `from_cache` field |

### Per-broker implementations

Each broker lives in `backend/app/brokers/<broker>/`:

```
backend/app/brokers/
├── adapter.py           ← Python ABC (this decision)
├── credentials.py       ← encrypt/decrypt helpers (ADR 002)
├── kite/
│   ├── adapter.py       ← KiteAdapter(BrokerAdapter)
│   ├── api.py           ← httpx wrapper for Kite Connect v3
│   └── types.py         ← Kite-specific Pydantic models
├── mock/
│   ├── adapter.py       ← MockAdapter(BrokerAdapter) for tests
│   └── types.py
└── __init__.py
```

---

## What the frontend does instead of calling broker APIs directly

The frontend calls FastAPI routes:

```
POST /api/brokers/{broker}/connect/start      → returns OAuth URL
GET  /api/brokers/{broker}/connect/callback   → exchanges code, stores creds
GET  /api/brokers/{broker}/profile            → returns BrokerProfile JSON
GET  /api/brokers/{broker}/holdings           → returns Holding[] JSON
POST /api/brokers/{broker}/orders             → places order via adapter
DELETE /api/brokers/{broker}/disconnect       → clears credentials
```

Each route validates the Supabase JWT, loads the adapter for the broker, retrieves
credentials via `credentials.py`, calls the Python adapter method, and returns a
JSON response shaped to match the TypeScript DTOs.

---

## Consequences

- Frontend engineers read `adapter.ts` to understand the contract; they never implement it.
- Backend engineers subclass `BrokerAdapter` (Python) for new brokers.
- Adding a new broker requires: one Python package in `backend/app/brokers/<broker>/`,
  one FastAPI router, and a new entry in the `BrokerId` literal — no frontend changes
  unless a new method is needed.
- Sync discipline is enforced by convention + code review, not by a code generator.
  If this becomes a pain point (e.g. after 3+ brokers), evaluate protobuf/OpenAPI
  generation as a replacement.
