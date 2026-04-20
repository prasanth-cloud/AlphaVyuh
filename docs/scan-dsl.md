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
  | { kind: "rs_rating_min"; value: number }               // Minervini RS
  | { kind: "distance_from_52w_high"; maxPct: number }     // e.g. <= 25%
  | { kind: "distance_from_52w_low"; minPct: number }      // e.g. >= 30%
  | { kind: "vcp_contraction"; minTightness: number; minPivots: number }
  | { kind: "volume_dry_up"; days: number; vs: "avg_50" };
```

## Trend Template (Minervini) — canonical preset

Composed of:
- `price_above_ma` for 50, 150, 200
- `ma_stack [50, 150, 200]`
- `rs_rating_min: 70`
- `distance_from_52w_high maxPct: 25`
- `distance_from_52w_low minPct: 30`

## Execution

Scans run against a cached EOD snapshot in Postgres, refreshed after market close via a scheduled job. The scan compiler turns a `ScanDefinition` into a single parameterized SQL query — no row-by-row evaluation in the app layer.

Each `scan_run` captures the input definition, the result rows, and a timestamp — so users can look back at "what did this scan find on Tuesday?"
