import type { ScannerIdeaContext } from "@/lib/api";

export type ScannerReviewContextSummary = {
  pills: string[];
  metrics: { label: string; value: string }[];
  primaryReason: string | null;
  warnings: string[];
  sourceLabel: string | null;
};

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatMode(value: string | null | undefined): string | null {
  const mode = compact(value);
  return mode ? mode.toUpperCase() : null;
}

function formatPrice(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `Rs ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function scannerReviewContextSummary(context: ScannerIdeaContext | null | undefined): ScannerReviewContextSummary {
  if (!context) {
    return { pills: [], metrics: [], primaryReason: null, warnings: [], sourceLabel: null };
  }

  const source = compact(context.data_source);
  const mode = formatMode(context.data_mode);
  const sourceLabel = source ? `Source: ${[source, mode].filter(Boolean).join(" · ")}` : mode ? `Source: ${mode}` : null;
  const setupLabel = [compact(context.setup_grade), context.setup_score != null ? String(context.setup_score) : null]
    .filter(Boolean)
    .join(" ");

  const pills = [
    compact(context.preset_name),
    setupLabel || null,
    context.data_as_of ? `As of ${context.data_as_of}` : null,
    sourceLabel,
  ].filter(Boolean) as string[];

  const metrics = [
    context.captured_price != null ? { label: "Captured", value: formatPrice(context.captured_price) ?? "—" } : null,
    context.rs_score != null ? { label: "RS", value: String(Math.round(context.rs_score)) } : null,
    context.price_perf_6m_pct != null ? { label: "6M", value: `${context.price_perf_6m_pct >= 0 ? "+" : ""}${context.price_perf_6m_pct.toFixed(1)}%` } : null,
    context.week_52_high_pct != null ? { label: "52W high", value: `${context.week_52_high_pct.toFixed(1)}% away` } : null,
    context.captured_volume_ratio != null ? { label: "Captured vol", value: `${context.captured_volume_ratio.toFixed(2)}x` } : null,
    context.volume_ratio != null ? { label: "Volume", value: `${context.volume_ratio.toFixed(2)}x` } : null,
    context.rsi_14 != null ? { label: "RSI", value: context.rsi_14.toFixed(1) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return {
    pills,
    metrics,
    primaryReason: context.match_reasons?.find((reason) => Boolean(reason.trim())) ?? null,
    warnings: context.data_warnings?.filter((warning) => Boolean(warning.trim())) ?? [],
    sourceLabel,
  };
}
