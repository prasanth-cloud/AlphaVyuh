import type { MarketAnalyticsBundle, SourceMetadata } from "@/lib/api/types";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requiredNumber(value: unknown, fallback = 0): number {
  return finiteNumber(value) ?? fallback;
}

function normalizeSourceMetadata(value: unknown): SourceMetadata | undefined {
  const source = recordValue(value);
  if (Object.keys(source).length === 0) return undefined;
  return source as SourceMetadata;
}

export function normalizeMarketAnalyticsPayload(raw: unknown): MarketAnalyticsBundle {
  const payload = recordValue(raw);
  const summary = recordValue(payload.summary);
  const completeness = recordValue(payload.completeness);
  const breadthHistory = Array.isArray(payload.breadth_history)
    ? payload.breadth_history.flatMap((value) => {
        const row = recordValue(value);
        if (typeof row.date !== "string" || !row.date) return [];
        return [{
          date: row.date,
          advances: requiredNumber(row.advances),
          declines: requiredNumber(row.declines),
          unchanged: requiredNumber(row.unchanged),
          total: requiredNumber(row.total),
          advance_decline_ratio: finiteNumber(row.advance_decline_ratio),
          advance_pct: finiteNumber(row.advance_pct),
          above_ema20_pct: finiteNumber(row.above_ema20_pct),
          above_ema50_pct: finiteNumber(row.above_ema50_pct),
          above_ema200_pct: finiteNumber(row.above_ema200_pct),
          new_52w_highs: finiteNumber(row.new_52w_highs),
          new_52w_lows: finiteNumber(row.new_52w_lows),
        }];
      })
    : [];
  const sectorLeaderboard = Array.isArray(payload.sector_leaderboard)
    ? payload.sector_leaderboard.flatMap((value) => {
        const row = recordValue(value);
        if (typeof row.sector !== "string" || !row.sector.trim()) return [];
        return [{
          sector: row.sector,
          rank: requiredNumber(row.rank),
          constituents: requiredNumber(row.constituents),
          advances: requiredNumber(row.advances),
          declines: requiredNumber(row.declines),
          return_5d_pct: finiteNumber(row.return_5d_pct),
          return_20d_pct: finiteNumber(row.return_20d_pct),
          breadth_pct: finiteNumber(row.breadth_pct),
        }];
      })
    : [];
  const rotationPoints = Array.isArray(payload.rotation_points)
    ? payload.rotation_points.flatMap((value) => {
        const row = recordValue(value);
        const quadrant = typeof row.quadrant === "string" && ["Leading", "Weakening", "Lagging", "Improving"].includes(row.quadrant)
          ? row.quadrant as MarketAnalyticsBundle["rotation_points"][number]["quadrant"]
          : null;
        const strength = finiteNumber(row.strength_score);
        const momentum = finiteNumber(row.momentum_score);
        if (typeof row.sector !== "string" || !quadrant || strength == null || momentum == null) return [];
        return [{
          sector: row.sector,
          strength_score: Math.max(0, Math.min(100, strength)),
          momentum_score: Math.max(0, Math.min(100, momentum)),
          quadrant,
          return_20d_pct: finiteNumber(row.return_20d_pct),
          momentum_delta_pct: finiteNumber(row.momentum_delta_pct),
        }];
      })
    : [];
  const completenessStatus = completeness.status === "complete" || completeness.status === "partial"
    ? completeness.status
    : "unknown";

  return {
    trade_date: typeof payload.trade_date === "string" ? payload.trade_date : null,
    phase: typeof payload.phase === "string" ? payload.phase : "Pending",
    breadth_history: breadthHistory,
    sector_leaderboard: sectorLeaderboard,
    rotation_points: rotationPoints,
    summary: {
      advances: finiteNumber(summary.advances),
      declines: finiteNumber(summary.declines),
      advance_decline_ratio: finiteNumber(summary.advance_decline_ratio),
      above_ema20_pct: finiteNumber(summary.above_ema20_pct),
      above_ema50_pct: finiteNumber(summary.above_ema50_pct),
      above_ema200_pct: finiteNumber(summary.above_ema200_pct),
      new_52w_highs: finiteNumber(summary.new_52w_highs),
      new_52w_lows: finiteNumber(summary.new_52w_lows),
    },
    rotation_label: typeof payload.rotation_label === "string" ? payload.rotation_label : "Sector participation map",
    rotation_methodology: typeof payload.rotation_methodology === "string" ? payload.rotation_methodology : "",
    lookback_sessions: requiredNumber(payload.lookback_sessions, breadthHistory.length),
    completeness: {
      status: completenessStatus,
      latest_session_rows: requiredNumber(completeness.latest_session_rows),
      active_universe: finiteNumber(completeness.active_universe),
      coverage_pct: finiteNumber(completeness.coverage_pct),
      sessions_requested: requiredNumber(completeness.sessions_requested, 21),
      sessions_available: requiredNumber(completeness.sessions_available, breadthHistory.length),
    },
    generated_at: typeof payload.generated_at === "string" ? payload.generated_at : null,
    source_metadata: normalizeSourceMetadata(payload.source_metadata),
    cache_status: typeof payload.cache_status === "string" ? payload.cache_status : undefined,
    mode: typeof payload.mode === "string" ? payload.mode : undefined,
  };
}
