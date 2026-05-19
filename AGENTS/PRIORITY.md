# Priority queue

This file exists to prevent feature overload. Until the core Professional Access workflow is stable, agents should not add new product surfaces unless a P0 bug requires it.

## Now — Professional Access

1. **Recover Railway production backend** — production must serve the FastAPI backend before customer-facing real-data workflows can be trusted.
2. **Prove full recovery evidence** — require authenticated scanner/watchlist API smoke and signed-in production browser smoke, not public API-only recovery.
3. **Stabilize build and launch gates** — keep `npm run launch:check`, checker self-tests, posture checks, and recovery preflights green.
4. **Simplify the app UI** — remove visible process layers, extra step trackers, and copy that explains the product too much.
5. **Keep copy informational** — no advisory language, no buy/sell prompts, no "best opportunity" framing.
6. **Verify with one real trader routine** — sign in, open dashboard, run scanner, save a symbol, open a chart, log or review a trade.

## Next — after the core path feels calm

7. **Market breadth analytics** — sector rotation and EMA breadth as context, not advice.
8. **Journal review memory** — observations from closed trades only.
9. **Broker execution hardening** — user-initiated order entry after account-level verification.
10. **Trade report upload** — CSV import first, screenshots/OCR later.

## Later — do not build during focus pass

11. Telegram alerts
12. Backtesting
13. US markets
14. Options/F&O workflows
15. Public social proof and heavy growth loops
