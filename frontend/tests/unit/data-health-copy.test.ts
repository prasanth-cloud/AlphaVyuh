import { describe, expect, it } from "vitest";

import { isRailwayFallbackResponse } from "@/lib/api-reachability";
import { marketDataHealthPresentation, bhavcopyProvenancePresentation, indicatorCoveragePresentation } from "@/lib/data-health-copy";

describe("market data health presentation", () => {
  it("shows an explicit production API outage state", () => {
    const presentation = marketDataHealthPresentation(null, "down");

    expect(presentation.value).toBe("DATA API DOWN");
    expect(presentation.status).toBe("bad");
    expect(presentation.detail).toContain("Market data API is unreachable");
  });

  it("keeps healthy EOD health copy when the API is reachable", () => {
    const presentation = marketDataHealthPresentation(
      { status: "healthy", latest_trade_date: "2026-05-18" },
      "ok",
    );

    expect(presentation.value).toBe("HEALTHY");
    expect(presentation.status).toBe("good");
    expect(presentation.detail).toContain("2026-05-18");
  });

  it("prefers healthy EOD ingest over a failed root health probe", () => {
    const presentation = marketDataHealthPresentation(
      { status: "healthy", latest_trade_date: "2026-06-09" },
      "down",
    );

    expect(presentation.value).toBe("HEALTHY");
    expect(presentation.status).toBe("good");
    expect(presentation.detail).toContain("2026-06-09");
    expect(presentation.detail).toContain("Live quote probe failed");
  });

  it("recognizes Railway fallback health responses as an API outage", () => {
    expect(isRailwayFallbackResponse(404, '{"message":"Application not found"}')).toBe(true);
    expect(isRailwayFallbackResponse(503, '{"message":"temporarily unavailable"}')).toBe(false);
  });

  it("surfaces bhavcopy failures instead of success with stale 404 text", () => {
    const presentation = bhavcopyProvenancePresentation({
      status: "healthy",
      latest_trade_date: "2026-06-09",
      last_successful_eod_date: "2026-06-09",
      hours_since_refresh: 2,
      symbols_on_latest_date: 990,
      universe_active: 1000,
      indicators_missing: { rsi_14: 0, ema_200: 0 },
      last_run: { id: "run-1", errors: 0 },
      last_bhavcopy: {
        trade_date: "2026-06-09",
        status: "failed",
        rows_ingested: 0,
        error_message: "404 Client Error: Not Found",
      },
    });

    expect(presentation.value).toBe("INGEST FAILED");
    expect(presentation.status).toBe("bad");
  });

  it("reports ema_200 indicator gaps honestly", () => {
    const presentation = indicatorCoveragePresentation({
      status: "degraded",
      latest_trade_date: "2026-06-09",
      last_successful_eod_date: "2026-06-09",
      hours_since_refresh: 2,
      symbols_on_latest_date: 1000,
      universe_active: 1000,
      indicators_missing: { rsi_14: 0, ema_200: 407 },
      indicator_coverage: {
        symbols_on_latest_date: 1000,
        rsi_14_missing: 0,
        ema_200_missing: 407,
        rsi_14_missing_pct: 0,
        ema_200_missing_pct: 40.7,
        has_gaps: true,
      },
      last_run: { id: "run-1", errors: 0 },
    });

    expect(presentation.value).toBe("EMA GAPS");
    expect(presentation.detail).toContain("407");
    expect(presentation.status).toBe("warn");
  });
});
