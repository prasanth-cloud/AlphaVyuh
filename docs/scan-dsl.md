# Scan DSL

> Load this file when working on the scanner engine or when a user-facing scan builder task comes up. This is the vocabulary the scan system speaks.

## Goal

Let users (and us) express SEPA, VCP, and custom setups as declarative filters over the EOD universe, without writing SQL in the product UI.

## Shape (draft)

```ts
type ScanDefinition = {
  name: string;
  universe: "nifty500" | "nifty_midsmallcap_400" | "all_nse";
  filters: Filter[];
  sort?: SortSpec;
  limit?: number;
};

type Filter =
  | { kind: "price_above_ma"; ma: 50 | 150 | 200 }
  | { kind: "ma_stack"; order: [50, 150, 200] }           // 50 > 150 > 200
  | { kind: "rs_score_min"; value: number }                // Minervini RS
  | { kind: "distance_from_52w_high"; maxPct: number }     // e.g. <= 25%
  | { kind: "distance_from_52w_low"; minPct: number }      // e.g. >= 30%
  | { kind: "vcp_contraction"; minTightness: number; minPivots: number }
  | { kind: "volume_dry_up"; days: number; vs: "avg_50" };
```

## Trend Template (Minervini) — canonical preset

Composed of:
- `price_above_ma` for 50, 150, 200
- `ma_stack [50, 150, 200]`
- `rs_score_min: 70`
- `distance_from_52w_high maxPct: 25`
- `distance_from_52w_low minPct: 30`

## Execution

Scans run against a cached EOD snapshot in Postgres, refreshed after market close via a scheduled job.

**Architecture (see ADR 005):** Single-day filters are pushed to the DB as WHERE clauses and executed in Postgres. Multi-day pattern filters (VCP, volume_dry_up) use a two-pass approach: Pass 1 returns candidates via DB filters; Pass 2 fetches a bounded lookback window for those candidates and runs Python-side pattern detection. This is a deliberate choice over a monolithic SQL compiler — see `docs/decisions/005-scan-engine.md` for the full rationale.

Each `scan_run` captures the input definition, the result rows, and a timestamp — so users can look back at "what did this scan find on Tuesday?" Historical re-runs over a date range (backtesting) are implemented as background jobs, not synchronous requests.
