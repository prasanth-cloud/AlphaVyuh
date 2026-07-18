import { describe, expect, it } from "vitest";
import { normalizeMarketAnalyticsPayload } from "@/lib/market-analytics";

describe("Market Pulse response normalization", () => {
  it("keeps complete breadth and sector participation evidence", () => {
    const payload = normalizeMarketAnalyticsPayload({
      trade_date: "2026-07-15",
      phase: "Neutral",
      summary: { advances: 1260, declines: 985, above_ema200_pct: 54.2 },
      breadth_history: [{ date: "2026-07-15", advances: 1260, declines: 985, total: 2310, above_ema200_pct: 54.2 }],
      sector_leaderboard: [{ sector: "Information technology", rank: 1, constituents: 42, advances: 28, declines: 13, return_5d_pct: 1.4, return_20d_pct: 4.2, breadth_pct: 66.7 }],
      rotation_points: [{ sector: "Information technology", strength_score: 75, momentum_score: 65, quadrant: "Leading", return_20d_pct: 4.2, momentum_delta_pct: 0.8 }],
      completeness: { status: "complete", latest_session_rows: 2310, active_universe: 2400, coverage_pct: 96.3, sessions_requested: 21, sessions_available: 21 },
      rotation_label: "Sector participation map",
      rotation_methodology: "Relative ranks, not a true RRG.",
      lookback_sessions: 21,
      source_metadata: { source_name: "NSE EOD", mode: "eod", as_of: "2026-07-15" },
    });

    expect(payload.trade_date).toBe("2026-07-15");
    expect(payload.breadth_history).toHaveLength(1);
    expect(payload.sector_leaderboard[0]).toMatchObject({ sector: "Information technology", rank: 1 });
    expect(payload.rotation_points[0]).toMatchObject({ quadrant: "Leading", strength_score: 75 });
    expect(payload.completeness).toMatchObject({ status: "complete", coverage_pct: 96.3 });
  });

  it("drops malformed arrays and preserves missing metrics as unknown", () => {
    const payload = normalizeMarketAnalyticsPayload({
      trade_date: "2026-07-15",
      breadth_history: [null, { date: "2026-07-15", advances: "1260", declines: 985, total: 2245 }],
      sector_leaderboard: [null, { sector: "", rank: 1 }],
      rotation_points: [
        { sector: "Banks", strength_score: 200, momentum_score: -20, quadrant: "Improving" },
        { sector: "Invalid", strength_score: 50, momentum_score: 50, quadrant: "Unknown" },
      ],
      completeness: { status: "partial", sessions_requested: 21, sessions_available: 1 },
    });

    expect(payload.breadth_history[0]).toMatchObject({ advances: 0, declines: 985, advance_decline_ratio: null });
    expect(payload.sector_leaderboard).toEqual([]);
    expect(payload.rotation_points).toEqual([{ sector: "Banks", strength_score: 100, momentum_score: 0, quadrant: "Improving", return_20d_pct: null, momentum_delta_pct: null }]);
    expect(payload.summary.above_ema200_pct).toBeNull();
    expect(payload.completeness.status).toBe("partial");
  });
});
