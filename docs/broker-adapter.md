# Broker adapter

> Load this file when adding a new broker, changing the adapter interface, or debugging an order flow. The interface is the contract — break it and everything downstream breaks.

## Why an adapter

alphavyuh supports multiple Indian brokers (Kite, Upstox, Dhan, …). Each has a different auth flow, order schema, and websocket feed. The rest of the app must not care which broker a user uses. All broker-specific logic lives in `lib/brokers/<broker>/`.

## The interface

Defined in `lib/brokers/adapter.ts`. Every broker implementation exports a class that satisfies `BrokerAdapter`:

```ts
interface BrokerAdapter {
  readonly id: BrokerId;

  // Auth
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<BrokerCredentials>;
  refresh(creds: BrokerCredentials): Promise<BrokerCredentials>;

  // Account
  getProfile(creds: BrokerCredentials): Promise<BrokerProfile>;
  getPositions(creds: BrokerCredentials): Promise<Position[]>;
  getHoldings(creds: BrokerCredentials): Promise<Holding[]>;

  // Orders
  placeOrder(creds: BrokerCredentials, order: OrderRequest): Promise<OrderResult>;
  modifyOrder(creds: BrokerCredentials, id: string, patch: OrderPatch): Promise<OrderResult>;
  cancelOrder(creds: BrokerCredentials, id: string): Promise<void>;
  getOrder(creds: BrokerCredentials, id: string): Promise<Order>;
  listOrders(creds: BrokerCredentials): Promise<Order[]>;

  // Streaming (optional — returns null if broker has no WS feed)
  subscribeFills?(creds: BrokerCredentials, onFill: (f: Fill) => void): Unsubscribe;
}
```

## Per-broker quirks

TODO as we implement each:

### Kite Connect (Zerodha)
- 24-hour access token lifetime; needs daily re-login
- Order statuses use Zerodha's terminology (`OPEN`, `COMPLETE`, `CANCELLED`, `REJECTED`)

### Upstox
- Bearer tokens, OAuth2 standard
- Separate sandbox environment — use it for tests

### Dhan
- TODO

## Testing

Every adapter ships with a `MockAdapter` implementation used in Playwright specs. Order placement e2e tests always run against the mock — we do not hit real broker APIs in CI.

## Idempotency

Every `placeOrder` call must include a client-generated idempotency key (UUID) stored on our side. On retry, if we already have a result for that key, return it without calling the broker again. This prevents double-submits on network flakes.
