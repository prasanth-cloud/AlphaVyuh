# Redis Scanner Cache — p95 Before/After

**Purpose:** Document the expected p95 improvement from caching the `daily_ohlcv` indicator
fetch for `latest_date` in Redis, eliminating the Supabase round-trip on cache hits.

**Recorded:** 2026-06-20
**Cache key:** `scan:indicators:latest:{date}`
**TTL:** 6 hours
**Invalidation:** On bhavcopy ingest completion (`services/bhavcopy.py`)

---

## Before (no cache)

From `scanner_performance.timing_ms` in production responses and
`docs/benchmarks/m3-production-env.md`:

| Metric | SEPA (3k symbols) | VCP all-NSE (3k symbols) |
|--------|-------------------|--------------------------|
| p50 query | 154ms | 3,815ms |
| p95 query | 545ms | 5,327ms |
| p95 total | ~600ms | ~5,400ms |

The `query` timing is the Supabase PostgREST round-trip — network + Postgres
query execution + JSON serialization. This is the component Redis replaces.

## After (Redis cache hit)

On a cache hit the Supabase round-trip is replaced by a Redis GET + JSON
deserialize. Expected timings based on typical Redis latency (same-region,
<1ms network + ~5-15ms for a 2-4MB JSON payload):

| Metric | SEPA (3k symbols) | VCP all-NSE (3k symbols) |
|--------|-------------------|--------------------------|
| p50 query (cached) | ~10-20ms | ~10-20ms |
| p95 query (cached) | ~25-40ms | ~25-40ms |
| p95 total (cached) | ~80-120ms | ~1,700-2,100ms |

**Estimated p95 query reduction:** 90-95% on cache hit.

VCP total remains higher because Pass 2 (multi-day lookback) still hits Supabase
for historical data — only the initial indicator fetch is cached.

## Cache miss path

First scan after ingest (or after TTL expiry) follows the original DB path.
The cache is populated on the first successful query, so subsequent scans
within the 6h window benefit.

## Trade-offs

- **Memory:** ~2-4MB per cached date (one active date at a time in practice).
- **Staleness:** Max 6h. Bhavcopy ingest explicitly invalidates, so real
  staleness is bounded by ingest schedule (daily 16:00 IST).
- **Graceful degradation:** If Redis is unavailable (`REDIS_URL` unset or
  connection fails), scanner falls back to direct Supabase queries with no
  behavior change. Logged once at startup.
- **Filter accuracy:** Cache stores the full unfiltered dataset. Python-side
  `_apply_filters` handles all filtering on cache hits (DB prefilter pushdown
  is skipped). Filter results are identical since `_apply_filters` is the
  authoritative filter implementation.

## Validation

To measure actual p95 after deployment:

```bash
# Run 50 scans and extract timing_ms.query from responses
for i in $(seq 1 50); do
  curl -s -X POST "$API/api/v1/scanner/run" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"preset_id":"momentum","filters":{}}' \
    | jq '.source_metadata.scanner_performance.timing_ms.query'
done | sort -n | awk 'NR==int(NF*0.95){print "p95:", $0}'
```

Check `scanner_performance.cache_hit` in the response to confirm Redis is active.
