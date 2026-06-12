import { buildScannerSectorStrength } from "@/lib/scanner-sector-strength";
import type { ScannerResultView } from "@/lib/scanner-result-columns";

type ScannerSectorHeatmapProps = {
  results: ScannerResultView[];
};

function heatTone(change: number | null): string {
  if (change == null || Number.isNaN(change)) return "var(--text-tertiary)";
  if (change >= 1.5) return "var(--gain)";
  if (change >= 0.25) return "rgba(45, 181, 116, 0.72)";
  if (change <= -1.5) return "var(--loss)";
  if (change <= -0.25) return "rgba(229, 56, 59, 0.72)";
  return "var(--text-secondary)";
}

export function ScannerSectorHeatmap({ results }: ScannerSectorHeatmapProps) {
  const sectors = buildScannerSectorStrength(results).slice(0, 12);
  if (sectors.length === 0) return null;

  return (
    <div className="scanner-sector-heatmap" data-testid="scanner-sector-heatmap">
      <div className="scanner-sector-heatmap-label">Sector heat</div>
      <div className="scanner-sector-heatmap-grid">
        {sectors.map((sector) => (
          <div
            key={sector.sector}
            className="scanner-sector-heatmap-cell"
            title={`${sector.sector}: ${sector.avgMovePct == null ? "—" : `${sector.avgMovePct >= 0 ? "+" : ""}${sector.avgMovePct.toFixed(1)}%`} avg · ${sector.activeCount} matches`}
          >
            <div
              className="scanner-sector-heatmap-bar"
              style={{ background: heatTone(sector.avgMovePct) }}
            />
            <div className="scanner-sector-heatmap-name">{sector.sector}</div>
            <div className="scanner-sector-heatmap-change">
              {sector.avgMovePct == null
                ? "—"
                : `${sector.avgMovePct >= 0 ? "+" : ""}${sector.avgMovePct.toFixed(1)}%`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
