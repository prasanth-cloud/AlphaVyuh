# Broker Validation Record

Use this record for read-only broker smoke and any explicitly approved
sandbox/live order validation. Do not paste access tokens, API secrets, full
account identifiers, PAN numbers, or screenshots that expose private account
data.

## Read-Only Smoke

- Date:
- Broker: Kite | Upstox
- Mode: read-only
- Account owner:
- Operator:
- Command:
- Token source: existing env | fresh login flow
- Masked account/profile identifier:
- Profile read result: pass | fail
- Holdings/instruments read result: pass | fail | not applicable
- Quote/order-book/candle read result: pass | fail | not applicable
- Failure summary, if any:
- Evidence location:

## Order Validation

Only fill this section after explicit account-owner confirmation. Do not use
this section for routine automated QA.

- Date:
- Broker: Kite | Upstox
- Mode: sandbox | live
- Account owner:
- Operator:
- Confirmed by:
- Confirmation timestamp:
- Symbol:
- Side: BUY | SELL
- Quantity:
- Order type: MARKET | LIMIT
- Limit price, if applicable:
- Expected risk plan: entry / stop / target
- Expected journal source: chart | watchlist
- AlphaVyuh plan validation: pass | fail
- `Ready` gating result: pass | fail
- Order draft gating result: pass | fail
- Broker submission result: pass | fail | not run
- Masked broker order id:
- Journal draft/update result: pass | fail
- Workflow lifecycle update result: pass | fail
- Close-trade/P&L/review result: pass | fail | not run
- Failure summary, if any:
- Evidence location:
