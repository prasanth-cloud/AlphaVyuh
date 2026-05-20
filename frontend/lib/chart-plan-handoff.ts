import type { WorkflowLifecycle, WorkflowStatePatch } from "@/lib/api";

export type ChartPlanSide = "long" | "short";

export type ChartPlanDraft = {
  symbol: string;
  side: ChartPlanSide;
  entry: number;
  stop: number;
  target: number;
  timeframe: string;
  source: "full_chart_drawing";
  drawingId: string;
  setupLabel: string;
  playbookScore: number;
  readyChecks: string[];
  riskReward: number;
  thesis: string;
  invalidationRule: string;
  createdAt: string;
};

export type ChartPlanDraftInput = {
  symbol: string;
  side: ChartPlanSide;
  entry: number;
  stop: number;
  target: number;
  timeframe: string;
  drawingId: string;
  setupLabel: string;
  playbookScore: number;
  readyChecks: string[];
  createdAt?: string;
};

function finiteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidGeometry(side: ChartPlanSide, entry: number, stop: number, target: number): boolean {
  if (side === "long") return stop < entry && target > entry;
  return stop > entry && target < entry;
}

function compactChecks(checks: string[]): string[] {
  return checks
    .map((check) => check.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function calculateRiskReward(entry: number, stop: number, target: number): number | null {
  if (!finiteNumber(entry) || !finiteNumber(stop) || !finiteNumber(target)) return null;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  return Number((Math.abs(target - entry) / risk).toFixed(2));
}

export function buildChartPlanDraft(input: ChartPlanDraftInput): ChartPlanDraft | null {
  const { symbol, side, entry, stop, target } = input;
  if (!symbol.trim() || !finiteNumber(entry) || !finiteNumber(stop) || !finiteNumber(target)) return null;
  if (!isValidGeometry(side, entry, stop, target)) return null;

  const riskReward = calculateRiskReward(entry, stop, target);
  if (riskReward == null) return null;

  const readyChecks = compactChecks(input.readyChecks);
  const label = input.setupLabel.trim() || "Chart setup";
  const score = Math.max(0, Math.min(100, Math.round(input.playbookScore)));
  const timeframe = input.timeframe || "D";
  const checkSummary = readyChecks.length ? ` Ready checks: ${readyChecks.join(", ")}.` : "";

  return {
    symbol: symbol.toUpperCase(),
    side,
    entry: Number(entry.toFixed(2)),
    stop: Number(stop.toFixed(2)),
    target: Number(target.toFixed(2)),
    timeframe,
    source: "full_chart_drawing",
    drawingId: input.drawingId,
    setupLabel: label,
    playbookScore: score,
    readyChecks,
    riskReward,
    thesis: `Chart plan: ${label} on ${timeframe}; playbook score ${score}; R:R ${riskReward.toFixed(2)}.${checkSummary}`,
    invalidationRule: `Invalidate if price breaches the drawn ${side === "long" ? "stop below" : "stop above"} ${Number(stop.toFixed(2))}.`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function buildWorkflowPatchFromChartDraft(
  draft: ChartPlanDraft,
  watchlistId: string | null | undefined,
): WorkflowStatePatch {
  const lifecycle: WorkflowLifecycle = "watch";
  const setupQuality = Math.max(1, Math.min(5, Math.round(draft.playbookScore / 20)));
  return {
    symbol: draft.symbol,
    watchlist_id: watchlistId ?? null,
    source: "chart",
    lifecycle,
    setup_type: draft.side === "short" ? "reversal" : "breakout",
    entry: draft.entry,
    stop: draft.stop,
    target: draft.target,
    timeframe: draft.timeframe,
    thesis: draft.thesis,
    invalidation_rule: draft.invalidationRule,
    confidence: setupQuality,
    setup_quality: setupQuality,
    notes: `Imported from Full chart ${draft.side} position drawing. ${draft.setupLabel}. R:R ${draft.riskReward.toFixed(2)}.`,
    tags: ["chart-plan", draft.side, draft.timeframe].filter(Boolean),
  };
}

export function parseChartPlanDraft(raw: string | null, expectedSymbol: string): ChartPlanDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChartPlanDraft>;
    if (parsed.symbol?.toUpperCase() !== expectedSymbol.toUpperCase()) return null;
    if (parsed.source !== "full_chart_drawing") return null;
    if (parsed.side !== "long" && parsed.side !== "short") return null;
    const entry = parsed.entry ?? Number.NaN;
    const stop = parsed.stop ?? Number.NaN;
    const target = parsed.target ?? Number.NaN;
    if (!finiteNumber(entry) || !finiteNumber(stop) || !finiteNumber(target)) return null;
    if (!isValidGeometry(parsed.side, entry, stop, target)) return null;
    return buildChartPlanDraft({
      symbol: parsed.symbol,
      side: parsed.side,
      entry,
      stop,
      target,
      timeframe: parsed.timeframe ?? "D",
      drawingId: parsed.drawingId ?? "unknown",
      setupLabel: parsed.setupLabel ?? "Chart setup",
      playbookScore: parsed.playbookScore ?? 0,
      readyChecks: Array.isArray(parsed.readyChecks) ? parsed.readyChecks : [],
      createdAt: parsed.createdAt,
    });
  } catch {
    return null;
  }
}
