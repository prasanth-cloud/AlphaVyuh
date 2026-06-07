import type { ScannerIdeaContext, WorkflowState } from "@/lib/api";

export type DecisionRecordReviewState = {
  state: "reviewed" | "needs-review" | "new";
} | null | undefined;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatPrice(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `Rs ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function decisionLifecycleLabel(workflow: Pick<WorkflowState, "lifecycle" | "ignored" | "review_later"> | null | undefined): string {
  if (!workflow) return "Watch";
  const lifecycle = typeof workflow.lifecycle === "string" ? workflow.lifecycle : "watch";
  if (workflow.ignored || lifecycle === "ignored") return "Ignored";
  if (workflow.review_later || lifecycle === "review_later") return "Review later";
  if (lifecycle === "ready") return "Ready";
  if (lifecycle === "reviewed") return "Reviewed";
  if (lifecycle === "watch") return "Watch";
  if (lifecycle === "idea") return "Idea";
  return lifecycle.replace("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function decisionSourceLabel(workflow: Pick<WorkflowState, "source" | "scanner_context"> | null | undefined): string {
  const scanner = workflow?.scanner_context ?? null;
  if (scanner?.preset_name) return `Scanner: ${scanner.preset_name}`;
  if (workflow?.source === "scanner") return "Scanner";
  if (workflow?.source === "watchlist") return "Watchlist";
  if (workflow?.source === "chart") return "Chart";
  if (workflow?.source === "broker") return "Broker import";
  return "Manual";
}

export function decisionJournalLabel(
  workflow: Pick<WorkflowState, "journal_id"> | null | undefined,
  reviewState: DecisionRecordReviewState,
): string {
  if (workflow?.journal_id) return "Journal linked";
  if (reviewState?.state === "reviewed") return "Reviewed trade history";
  if (reviewState?.state === "needs-review") return "Closed trade needs review";
  return "No linked journal yet";
}

export function scannerCapturedPriceLabel(context: ScannerIdeaContext | null | undefined): string | null {
  const price = formatPrice(context?.captured_price);
  if (!price) return null;
  const change = formatPct(context?.captured_change_pct);
  const volume = context?.captured_volume_ratio != null && Number.isFinite(context.captured_volume_ratio)
    ? `${context.captured_volume_ratio.toFixed(2)}x volume`
    : null;
  return [price, change, volume].filter(Boolean).join(" · ");
}

export function decisionRecordRows({
  workflow,
  reviewState,
  currentPrice,
  currentChangePct,
}: {
  workflow: WorkflowState | null | undefined;
  reviewState?: DecisionRecordReviewState;
  currentPrice?: number | null;
  currentChangePct?: number | null;
}): Array<{ label: string; value: string }> {
  const scanner = workflow?.scanner_context ?? null;
  const firstReason = scanner?.match_reasons?.find((reason) => clean(reason));
  const captured = scannerCapturedPriceLabel(scanner);
  const current = formatPrice(currentPrice);
  const currentChange = formatPct(currentChangePct);
  return [
    { label: "Source", value: decisionSourceLabel(workflow) },
    firstReason ? { label: "Reason", value: firstReason } : null,
    scanner?.data_as_of ? { label: "Data as of", value: scanner.data_as_of } : null,
    captured ? { label: "Captured price", value: captured } : null,
    current ? { label: "Current price", value: [current, currentChange].filter(Boolean).join(" · ") } : null,
    { label: "Status", value: decisionLifecycleLabel(workflow) },
    { label: "Journal", value: decisionJournalLabel(workflow, reviewState) },
  ].filter((row): row is { label: string; value: string } => Boolean(row));
}
