# Broker adapter

> Load this file when adding a new broker, changing the adapter interface, or debugging
> an order flow. The interface is the contract — break it and everything downstream breaks.
>
> Architecture decision: docs/decisions/004-adapter-language-split.md

---

## Architecture split

alphavyuh uses a two-layer adapter architecture:

| Layer | File | Language | Role |
|---|---|---|---|
| **Contract** | `frontend/lib/brokers/adapter.ts` | TypeScript | Canonical type definitions. Types-only — no implementation. |
| **Contract (mirror)** | `backend/app/brokers/adapter.py` | Python | ABC mirroring the TS contract. All implementations subclass this. |
| **Implementations** | `backend/app/brokers/<broker>/` | Python | Real broker API logic (Kite, Upstox, Dhan, Mock). |

**Why this split:** Broker credentials must never reach the browser. All decryption and
broker API calls run in the Python backend (`credentials.py` is the single decryption
point). The TypeScript interface is kept as the canonical contract because it was designed
with significant care and gives both frontend and backend engineers a single readable
source of truth. See `docs/decisions/004-adapter-language-split.md` for full rationale.

---

## The contract

Defined in `frontend/lib/brokers/adapter.ts` — this is the **source of truth**.

The Python ABC at `backend/app/brokers/adapter.py` mirrors every method and DTO with
identical semantics and snake_case names. **Both files must stay in sync.** Any change
requires updating both in the same PR with a reviewer pass.

### Method map (TypeScript → Python)

| TypeScript | Python |
|---|---|
| `getAuthUrl(state)` | `get_auth_url(state)` |
| `exchangeCode(code)` | `exchange_code(code)` |
| `refresh(creds)` | `refresh(creds)` |
| `getProfile(creds)` | `get_profile(creds)` |
| `getPositions(creds)` | `get_positions(creds)` |
| `getHoldings(creds)` | `get_holdings(creds)` |
| `placeOrder(creds, order)` | `place_order(creds, order)` |
| `modifyOrder(creds, id, patch)` | `modify_order(creds, broker_order_id, patch)` |
| `cancelOrder(creds, id)` | `cancel_order(creds, broker_order_id)` |
| `getOrder(creds, id)` | `get_order(creds, broker_order_id)` |
| `listOrders(creds)` | `list_orders(creds)` |
| `subscribeFills(creds, onFill)` | `subscribe_fills(creds, on_fill)` |

---

## Per-broker implementations

Each broker lives in its own package under `backend/app/brokers/<broker>/`:

```
backend/app/brokers/
├── adapter.py           ← Python ABC — the contract
├── credentials.py       ← encrypt/decrypt helpers (ADR 002)
├── kite/
│   ├── __init__.py
│   ├── adapter.py       ← KiteAdapter(BrokerAdapter)
│   ├── api.py           ← httpx wrapper for Kite Connect v3
│   └── types.py         ← Kite-specific Pydantic models (not leaked to contract)
├── mock/
│   ├── __init__.py
│   ├── adapter.py       ← MockAdapter(BrokerAdapter) for Playwright tests
│   └── types.py
└── __init__.py
```

- **adapter.py** — the adapter class. All business logic. Wraps SDK exceptions in `BrokerError`.
- **api.py** — thin httpx client. Auth headers, timeouts, transient-5xx retry. No business logic.
- **types.py** — broker-specific Pydantic models mapping raw broker JSON to canonical DTOs.
  Never imported outside the broker package.

---

## Per-broker quirks

### Kite Connect (Zerodha)

- **Token lifetime:** access token expires at 06:00 IST daily. No refresh flow — user
  must re-login via OAuth. `refresh()` raises `BrokerError(kind="AUTH_EXPIRED")`.
- **Order status mapping:**

  | Kite status | Our `OrderStatus` |
  |---|---|
  | `OPEN` | `OPEN` |
  | `COMPLETE` | `COMPLETE` |
  | `CANCELLED` | `CANCELLED` |
  | `REJECTED` | `REJECTED` |
  | `TRIGGER PENDING` | `PENDING` |
  | `OPEN PENDING` | `PENDING` |
  | `AMO REQ RECEIVED` | `PENDING` |

- **Fills:** Kite doesn't include fill details in the order response. The adapter calls
  `GET /orders/{order_id}/trades` separately and merges the results before returning.
- **CO/BO:** bracket/cover orders produce child legs. Parent ID is returned in
  `OrderResult`; child IDs in `child_broker_order_ids`. Child legs cannot be managed
  independently through this interface.

### Upstox

- Bearer tokens, OAuth2 standard flow. Separate sandbox environment — use it for tests.

### Dhan

- TODO

---

## Frontend → Backend flow

The frontend never calls broker APIs directly. It calls FastAPI routes:

```
POST   /api/brokers/{broker}/connect/start    → returns { auth_url }
GET    /api/brokers/{broker}/connect/callback → exchanges code, stores creds, redirects
GET    /api/brokers/{broker}/profile          → BrokerProfile JSON
GET    /api/brokers/{broker}/holdings         → Holding[] JSON
POST   /api/brokers/{broker}/orders           → places order, returns OrderResult JSON
DELETE /api/brokers/{broker}/disconnect       → clears credentials
```

Each route validates the Supabase JWT, loads the adapter, retrieves encrypted credentials
via `credentials.get_broker_credential()`, calls the Python adapter method, and returns
JSON matching the TypeScript DTOs.

---

## Testing

Every adapter ships with `MockAdapter` in `backend/app/brokers/mock/`. Playwright specs
use the mock — real broker APIs are never called in CI.

Backend unit tests in `backend/tests/test_<broker>_adapter.py` mock httpx at the
transport layer. No real network calls.

For a real account smoke that does not place orders:

```bash
cd backend
python scripts/test_kite_connection.py --login-url
python scripts/test_kite_connection.py --request-token <request_token>

python scripts/test_upstox_connection.py --login-url
python scripts/test_upstox_connection.py --code <authorization_code>
```

These scripts verify OAuth/profile/account reads and market/order-book reads where
supported. They mask tokens by default and never submit, modify, or cancel orders.

---

## Idempotency

Every `place_order` call must include a client-generated `idempotency_key` (UUID v4,
≤36 chars) stored in the `order_idempotency` DB table (migration 025). Before calling
the broker, the adapter checks for an existing row. If found, it returns the cached
`OrderResult` with `from_cache=True` without contacting the broker.

---

## Adding a new broker

1. Create `backend/app/brokers/<broker>/` with `__init__.py`, `adapter.py`, `api.py`, `types.py`.
2. Subclass `BrokerAdapter` from `backend/app/brokers/adapter.py`.
3. Add `"<broker>"` to the `BrokerId` literal in **both** adapter files (TS + Python).
4. Add the broker to the `CHECK (broker IN (...))` constraint in a new migration.
5. Register the adapter in the broker factory.
6. Add unit tests in `backend/tests/test_<broker>_adapter.py`.
7. Ensure MockAdapter covers the new broker for Playwright.
