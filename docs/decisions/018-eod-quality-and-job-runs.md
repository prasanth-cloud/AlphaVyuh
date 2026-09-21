# Decision 018 — Fail-closed EOD quality evidence

Status: accepted for the current implementation slice.

## Decision

Validate NSE bhavcopy rows before writing market data. Keep only rows with a supported series, complete positive OHLCV values, valid candle geometry, and one row per symbol. Record source, accepted, filtered-series, missing, invalid-OHLCV, and duplicate counts on the per-date bhavcopy log.

Create a generic service-owned `job_runs` table for each bhavcopy attempt. It stores the job type, trade date, status, timing, input payload, result, and failure detail. The job record is best-effort so an unapplied additive migration cannot take down the existing EOD path; once applied, it becomes the durable operational evidence for the import.

## Rationale

The prior path dropped malformed rows silently and used `ingest_runs` as a broad refresh summary. That made it difficult to tell whether a successful-looking import was complete, partial, or cleaned from unsafe source data. Explicit counters preserve the evidence needed before a scanner or alert consumes a date.

## Boundaries

- This slice remains EOD-only; it does not add live streaming, derivatives, or vendor redistribution rights.
- Service-role-only job history is not exposed to browser clients.
- Indicators and RS-score computation remain downstream of the validated raw-row write.
- The migration is additive and must be applied and RLS/privilege-tested in the correct Supabase project before production claims.

## Follow-up

Verify the migration in staging, expose a sanitized quality summary in the data-health surface, and then replace the saved-screen JSON editor with the normalized scanner definition/group/filter builder.
