export type ScannerSectorStrengthInput = {
  symbol: string;
  sector?: string | null;
  pct_change?: number | null;
  volume_ratio?: number | null;
  rs_score?: number | null;
  setup_score?: number | null;
  week_52_high_pct?: number | null;
  data_warnings?: string[];
};

export type ScannerSectorStrength = {
  sector: string;
  activeCount: number;
  avgSetupScore: number | null;
  avgRsScore: number | null;
  avgMovePct: number | null;
  avgVolumeRatio: number | null;
  nearHighCount: number;
  warningCount: number;
  score: number;
  label: "Leader" | "Constructive" | "Mixed" | "Weak";
  reason: string;
  topSymbols: string[];
};

function finite(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function average(values: Array<number | null | undefined>): number | null {
  const clean = values.map(finite).filter((value): value is number => value != null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function sectorName(value: string | null | undefined): string {
  const clean = value?.trim();
  return clean || "Unmapped sector";
}

function labelForScore(score: number): ScannerSectorStrength["label"] {
  if (score >= 72) return "Leader";
  if (score >= 54) return "Constructive";
  if (score >= 34) return "Mixed";
  return "Weak";
}

function formatReason(summary: Pick<ScannerSectorStrength, "avgRsScore" | "avgMovePct" | "avgVolumeRatio" | "nearHighCount" | "warningCount">): string {
  const reasons: string[] = [];
  if (summary.avgRsScore != null) reasons.push(`RS ${Math.round(summary.avgRsScore)}`);
  if (summary.avgMovePct != null) reasons.push(`${summary.avgMovePct >= 0 ? "+" : ""}${summary.avgMovePct.toFixed(1)}% move`);
  if (summary.avgVolumeRatio != null) reasons.push(`${summary.avgVolumeRatio.toFixed(1)}x volume`);
  if (summary.nearHighCount > 0) reasons.push(`${summary.nearHighCount} near 52W high`);
  if (summary.warningCount > 0) reasons.push(`${summary.warningCount} data warning${summary.warningCount === 1 ? "" : "s"}`);
  return reasons.slice(0, 3).join(" · ") || "Needs more scanner evidence";
}

export function buildScannerSectorStrength(results: ScannerSectorStrengthInput[]): ScannerSectorStrength[] {
  const groups = new Map<string, ScannerSectorStrengthInput[]>();

  for (const result of results) {
    const sector = sectorName(result.sector);
    groups.set(sector, [...(groups.get(sector) ?? []), result]);
  }

  return Array.from(groups.entries())
    .map(([sector, items]) => {
      const avgSetupScore = average(items.map((item) => item.setup_score));
      const avgRsScore = average(items.map((item) => item.rs_score));
      const avgMovePct = average(items.map((item) => item.pct_change));
      const avgVolumeRatio = average(items.map((item) => item.volume_ratio));
      const nearHighCount = items.filter((item) => finite(item.week_52_high_pct) != null && Number(item.week_52_high_pct) <= 10).length;
      const warningCount = items.reduce((sum, item) => sum + (item.data_warnings?.length ?? 0), 0);
      const countBoost = Math.min(8, Math.log2(items.length + 1) * 3);
      const score =
        (avgSetupScore ?? 45) * 0.32 +
        (avgRsScore ?? 45) * 0.32 +
        (avgMovePct ?? 0) * 2.4 +
        Math.min(avgVolumeRatio ?? 1, 3) * 7 +
        (nearHighCount / Math.max(1, items.length)) * 14 +
        countBoost -
        (warningCount / Math.max(1, items.length)) * 8;
      const sortedSymbols = [...items]
        .sort((a, b) => {
          const bScore = (finite(b.setup_score) ?? 0) + (finite(b.rs_score) ?? 0) + (finite(b.volume_ratio) ?? 0) * 4;
          const aScore = (finite(a.setup_score) ?? 0) + (finite(a.rs_score) ?? 0) + (finite(a.volume_ratio) ?? 0) * 4;
          return bScore - aScore;
        })
        .map((item) => item.symbol.toUpperCase());
      const summary = {
        sector,
        activeCount: items.length,
        avgSetupScore,
        avgRsScore,
        avgMovePct,
        avgVolumeRatio,
        nearHighCount,
        warningCount,
        score: Math.round(score),
        label: labelForScore(score),
        reason: "",
        topSymbols: Array.from(new Set(sortedSymbols)).slice(0, 3),
      } satisfies ScannerSectorStrength;

      return { ...summary, reason: formatReason(summary) };
    })
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return b.activeCount - a.activeCount;
    });
}
