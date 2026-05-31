type ScannerTrustInput = {
  source?: string | null;
  asOf?: string | null;
  mode?: string | null;
  coveragePct?: number | null;
};

export type ScannerMatchResult = {
  close?: number | null;
  pct_change?: number | null;
  volume_ratio?: number | null;
  rsi_14?: number | null;
  ema_50?: number | null;
  ema_200?: number | null;
  atr_14?: number | null;
  atr_pct?: number | null;
  week_52_high_pct?: number | null;
  rs_score?: number | null;
  sector?: string | null;
  match_reasons?: string[];
  confidence_reasons?: string[];
  data_warnings?: string[];
  setup_score?: number | null;
  setup_grade?: string | null;
  confidence_label?: string | null;
};

export type ScannerMatchExplanation = {
  headline: string;
  reasons: string[];
  confirmations: string[];
  warnings: string[];
  context: { label: string; value: string }[];
  metrics: { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
  nextAction: string;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueClean(values: Array<string | null | undefined>, fallback: string): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const next = clean(value);
    if (next) seen.add(next);
  }
  return seen.size > 0 ? [...seen] : [fallback];
}

function formatNumber(value: number | null | undefined, digits = 1): string | null {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : null;
}

function formatPct(value: number | null | undefined, digits = 1, signed = false): string | null {
  if (!Number.isFinite(value)) return null;
  const number = Number(value);
  const prefix = signed && number > 0 ? "+" : "";
  return `${prefix}${number.toFixed(digits)}%`;
}

function formatPrice(value: number | null | undefined): string | null {
  if (!Number.isFinite(value)) return null;
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function setupTone(score: number | null | undefined): "good" | "warn" | "bad" | undefined {
  if (score == null) return undefined;
  if (score >= 80) return "good";
  if (score >= 65) return "warn";
  return "bad";
}

function scannerNextAction(result: ScannerMatchResult): string {
  if (result.data_warnings?.length) return "Check data before planning";
  if ((result.setup_score ?? 0) >= 80) return "Open chart and plan risk";
  if ((result.setup_score ?? 0) >= 65) return "Review chart structure";
  if (result.rsi_14 != null && result.rsi_14 > 78) return "Check extension risk";
  if (result.week_52_high_pct != null && result.week_52_high_pct > 15) return "Wait for cleaner base";
  return "Shortlist for review";
}

export function buildScannerMatchExplanation(
  result: ScannerMatchResult,
  options: {
    presetName?: string | null;
    tradeDate?: string | null;
    scanTrust?: ScannerTrustInput | null;
  } = {},
): ScannerMatchExplanation {
  const source = clean(options.scanTrust?.source);
  const asOf = clean(options.scanTrust?.asOf) ?? clean(options.tradeDate);
  const mode = clean(options.scanTrust?.mode)?.toUpperCase();
  const setupLabel = result.setup_score != null
    ? [clean(result.confidence_label), clean(result.setup_grade), String(result.setup_score)].filter(Boolean).join(" · ")
    : clean(result.confidence_label);

  const reasons = uniqueClean(result.match_reasons ?? [], "Matched the active scanner filters");
  const confirmations = uniqueClean(result.confidence_reasons ?? [], setupLabel ?? "Needs chart confirmation");
  const priceChange = formatPct(result.pct_change, 2, true);
  const volumeRatio = formatNumber(result.volume_ratio, 2);
  const close = formatPrice(result.close);
  const ema50 = formatPrice(result.ema_50);
  const ema200 = formatPrice(result.ema_200);
  const isAboveTrend =
    result.close != null &&
    result.ema_50 != null &&
    result.ema_200 != null &&
    result.close > result.ema_50 &&
    result.close > result.ema_200;
  const atrPct = result.atr_pct != null
    ? formatPct(result.atr_pct)
    : result.atr_14 != null && result.close
      ? formatPct((result.atr_14 / result.close) * 100)
      : null;

  return {
    headline: reasons[0],
    reasons,
    confirmations,
    warnings: result.data_warnings?.map((warning) => warning.trim()).filter(Boolean) ?? [],
    context: [
      clean(options.presetName) ? { label: "Scan", value: clean(options.presetName)! } : null,
      clean(result.sector ?? undefined) ? { label: "Sector", value: clean(result.sector ?? undefined)! } : null,
      source ? { label: "Source", value: [source, mode].filter(Boolean).join(" · ") } : mode ? { label: "Source", value: mode } : null,
      asOf ? { label: "As of", value: asOf } : null,
      options.scanTrust?.coveragePct != null ? { label: "Coverage", value: `${options.scanTrust.coveragePct}%` } : null,
    ].filter(Boolean) as { label: string; value: string }[],
    metrics: [
      close ? { label: "Last price", value: priceChange ? `${close} (${priceChange})` : close, tone: result.pct_change != null && result.pct_change < 0 ? "bad" : "good" } : null,
      volumeRatio ? { label: "Volume", value: `${volumeRatio}x 20D avg`, tone: result.volume_ratio != null && result.volume_ratio >= 1.5 ? "good" : undefined } : null,
      result.rs_score != null ? { label: "RS score", value: String(Math.round(result.rs_score)), tone: result.rs_score >= 70 ? "good" : "warn" } : null,
      result.week_52_high_pct != null ? { label: "52W high", value: `${result.week_52_high_pct.toFixed(1)}% away`, tone: result.week_52_high_pct <= 10 ? "good" : undefined } : null,
      result.rsi_14 != null ? { label: "RSI 14", value: result.rsi_14.toFixed(1), tone: result.rsi_14 > 78 ? "warn" : result.rsi_14 >= 50 ? "good" : undefined } : null,
      ema50 || ema200 ? { label: "Trend", value: [`EMA50 ${ema50 ?? "n/a"}`, `EMA200 ${ema200 ?? "n/a"}`].join(" · "), tone: isAboveTrend ? "good" : undefined } : null,
      atrPct ? { label: "ATR risk", value: atrPct, tone: result.atr_pct != null && result.atr_pct > 8 ? "warn" : undefined } : null,
      setupLabel ? { label: "Setup quality", value: setupLabel, tone: setupTone(result.setup_score) } : null,
    ].filter(Boolean) as { label: string; value: string; tone?: "good" | "warn" | "bad" }[],
    nextAction: scannerNextAction(result),
  };
}
