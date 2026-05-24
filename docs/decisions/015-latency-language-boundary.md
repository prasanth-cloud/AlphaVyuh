# ADR 015 — Latency and Language Boundary

## Status

Accepted — 2026-05-24.

---

## Context

The founder asked whether AlphaVyuh should be implemented in C++ because C++ is
widely used in finance for low latency.

C++ is common in finance where latency itself is the product:

- exchange gateways
- colocated market making
- tick-by-tick ingestion
- order book simulation
- high-frequency execution
- large-scale backtesting or indicator computation

AlphaVyuh's current product is different. It is an EOD-first trading workflow
platform for scanning, watchlists, chart planning, broker import, journaling,
and review. The user trust problems observed in launch and QA work are mostly:

- production data availability
- data freshness and provenance
- enough chart history
- reliable scanner/watchlist/journal flows
- honest outage states
- smooth onboarding
- signed-in smoke coverage
- broker import safety

Those problems are not solved by rewriting the product in C++.

---

## Decision

Do not rewrite AlphaVyuh in C++.

Keep the product application in the current stack unless a measured bottleneck
forces a smaller service boundary:

- Next.js/TypeScript for the user-facing workflow.
- Supabase/Postgres for product state, RLS, auth, and user-owned data.
- Python/FastAPI for broker adapters, ingestion, and operational scripts where
  developer speed and ecosystem fit matter.
- C++ or Rust only for isolated, measured hot paths.

## Allowed Future C++ Boundaries

C++ may be considered for a separate service if all conditions are met:

1. A benchmark proves the current implementation misses a user-critical latency,
   throughput, or cost target.
2. The service has a narrow contract and does not own product UI or user auth.
3. The output can be validated against Python/TypeScript golden fixtures.
4. Deployment and observability are understood before implementation.
5. The work improves the journal/data-trust wedge from ADR 013.

Good candidates:

- bulk EOD indicator computation across a larger universe
- historical backtest engine for journal-rule hypothesis testing
- tick ingestion or bar aggregation if licensed intraday data is added
- low-latency broker execution gateway only after order placement is approved

Rejected candidates:

- rewriting the frontend
- rewriting Supabase-backed product workflows
- rewriting scanner UI or journal UI for perceived performance
- adding a C++ service before measuring the bottleneck

## Data Accuracy Implication

Data accuracy is a product contract, not a language choice.

AlphaVyuh should improve accuracy through:

- licensed or official data sources
- freshness checks
- source/provenance labels
- row-count and coverage checks
- chart-history depth checks
- signed-in scanner/watchlist smoke tests
- deterministic regression tests for unavailable payloads and failed mutations

C++ can make a wrong answer arrive faster. It does not make the answer correct.

## Revisit Conditions

Revisit this ADR if one of these becomes true:

- EOD indicator/backtest computation exceeds a defined p95 target after query
  and indexing work.
- Intraday licensed data is added and bar aggregation becomes a measured
  throughput bottleneck.
- Approved broker execution requires latency below what the Python service can
  reliably provide.
- A high-value paid-user workflow requires simulation volume that is too slow or
  too costly in the current stack.

Until then, prioritize product quality, data trust, and journal analytics over a
language rewrite.
