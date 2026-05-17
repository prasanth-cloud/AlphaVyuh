# Public Market Cost Guards - 2026-05-17

## Summary

The Security Agent route inventory kept public EOD/reference data open, but
called out provider-backed live quote and live candle routes as cost-abuse
surfaces. These endpoints can touch configured market-data providers, so they now
have a lightweight per-client limiter.

## Change

- Added `public_market_limiter` for provider-backed public quote/candle routes.
- Added a coarse client key helper that prefers the first `x-forwarded-for` IP
  and falls back to the request client host.
- Guarded:
  - `GET /api/v1/stocks/{symbol}/quote-live`
  - `GET /api/v1/charts/{symbol}/candles-live`
- Added tests proving the limiter blocks before provider calls are made.

## Why

Normal chart/watchlist use should stay smooth, but unauthenticated provider-backed
routes need a cost and abuse boundary before live data is enabled broadly.

## Improve Next

- Move app-level rate limits to Redis or edge middleware when traffic grows
  beyond a single-process deployment.
- Add provider-specific budget metrics to Agent Mission Control or launch ops.
