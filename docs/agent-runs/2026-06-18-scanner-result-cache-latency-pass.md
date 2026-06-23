# Scanner Result Cache Latency Pass - 2026-06-18

## Goal

Reduce repeated scanner latency without introducing a native-language rewrite
before profiling proves Python compute is the bottleneck.

## Evidence

- Scanner filters are already pushed into Postgres/PostgREST where possible.
- The backend already caches trade-date, M3-A readiness, and universe-count
  lookups.
- The frontend's hot cache only deduplicated identical requests for five
  seconds in one browser tab.
- Repeating the same EOD scan still reran the database query, Python filters,
  scoring, sorting, and diagnostics on the backend.

## Change

- Added a 60-second, 128-entry backend cache keyed by:
  - completed trade date
  - normalized scanner request
  - plan
  - plan-limit mode
  - scoring mode
  - diagnostics mode
- Cached responses are deep-copied so callers cannot mutate shared state.
- Expired entries are removed and the cache is bounded.
- Compatibility and base-query fallback responses are never cached, so a
  transient degraded query cannot remain pinned after recovery.
- Cache hits report:
  - `cache_status: hit`
  - zero query/filter/scoring/sort time
  - cache lookup and total time
  - the original uncached total as `cache_origin_total_ms`
- The production benchmark output now reports cache status.
- Scoped browser-side in-flight request coalescing to a SHA-256 digest of the
  current authorization header. Settled responses are not reused in the
  browser, so plan/account changes still reach the authorization-enforcing
  backend; repeated server work is handled by the plan-keyed backend cache.
- Result-cache-bypassed production benchmark requests use
  `Cache-Control: no-cache`, preventing the benchmark warmup from hiding the
  main database/filter pipeline behind result-cache hits. Trade-date,
  readiness, and universe-count helper caches remain warm and are reported as
  such; this is not described as a fully cold-start benchmark.
- Removed authenticated scanner execution from preset hover/focus. Speculative
  UI movement can no longer consume the user's 30-scans-per-minute allowance.

## Verification

- Backend scanner tests: 71 passed.
- Full backend tests: 341 passed.
- Frontend tests: 480 passed.
- Scanner benchmark checker passed.
- Frontend lint and typecheck passed.
- Performance smoke passed.

The regression test proves a repeated identical scan makes no additional table
calls and returns from the cache path.

## Architecture Decision

Do not add C++ yet. The current request path is dominated by remote data access
and repeated work. Native code would add build, deployment, observability, and
memory-safety boundary complexity without reducing network time. Reconsider a
native kernel only after production profiling shows a stable CPU-heavy function
consuming a material share of p95 latency.

## Next

1. Run the production scanner benchmark with a short-lived QA bearer token and
   save p50/p95 JSON as the baseline.
2. Add a shared cache such as Redis only if multi-instance cache hit rate is too
   low; the current cache is process-local by design.
3. Add request coalescing if production traces show simultaneous identical
   cache misses.
4. Keep live broker execution disabled until sandbox order lifecycle,
   idempotency, reconciliation, and journal-write tests all pass.
