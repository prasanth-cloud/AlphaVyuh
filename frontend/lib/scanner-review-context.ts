import type { ScannerIdeaContext } from "@/lib/api";

export type ScannerReviewContextSummary = {
  pills: string[];
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

export function scannerReviewContextSummary(context: ScannerIdeaContext | null | undefined): ScannerReviewContextSummary {
  if (!context) {
    return { pills: [], primaryReason: null, warnings: [], sourceLabel: null };
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

  return {
    pills,
    primaryReason: context.match_reasons?.find((reason) => Boolean(reason.trim())) ?? null,
    warnings: context.data_warnings?.filter((warning) => Boolean(warning.trim())) ?? [],
    sourceLabel,
  };
}
