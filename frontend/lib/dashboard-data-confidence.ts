import type { DataHealth } from "@/lib/api/types";

export type DashboardDataConfidenceTone = "ready" | "action" | "warn" | "empty";

export type DashboardDataConfidenceCheck = {
  id: "market" | "coverage" | "account" | "alerts" | "journal" | "import";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: DashboardDataConfidenceTone;
};

export type DashboardDataConfidenceInput = {
  marketDataStatus: DataHealth["status"] | null;
  marketDataMode?: string | null;
  tradeDate: string | null;
  latestTradeDate?: string | null;
  hoursSinceRefresh?: number | null;
  coveragePct?: number | null;
  symbolsOnLatestDate?: number | null;
  universeActive?: number | null;
  fallbackActive?: boolean | null;
  marketError?: string | null;
  accountIssueCount: number;
  alertIssueCount: number;
  closedTrades: number;
  knownUnreviewedTrades?: number | null;
  reviewCoveragePartial?: boolean;
  trackedSymbols: number;
  scanAlerts: number;
  alertMatchSymbols: number;
  brokerConnected: boolean;
  brokerStatusLabel?: string | null;
  brokerLastSyncedAt?: string | null;
};

export type DashboardDataConfidence = {
  tone: DashboardDataConfidenceTone;
  score: number;
  headline: string;
  summary: string;
  checks: DashboardDataConfidenceCheck[];
  primaryAction: DashboardDataConfidenceCheck;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneForScore(score: number): DashboardDataConfidenceTone {
  if (score >= 82) return "ready";
  if (score >= 58) return "action";
  return "warn";
}

function formatTradeDate(input: DashboardDataConfidenceInput) {
  return input.latestTradeDate ?? input.tradeDate ?? "pending";
}

function formatRefreshAge(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours)) return null;
  if (hours < 1) return "refreshed within the last hour";
  const rounded = Math.round(hours);
  return `refreshed ${rounded} hour${rounded === 1 ? "" : "s"} ago`;
}

function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : `${Math.round(value)}%`;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function buildDashboardDataConfidence(input: DashboardDataConfidenceInput): DashboardDataConfidence {
  const hasMarketError = Boolean(input.marketError?.trim());
  const status = input.marketDataStatus;
  const refreshAge = formatRefreshAge(input.hoursSinceRefresh);
  const tradeDate = formatTradeDate(input);
  const mode = input.marketDataMode === "demo" ? "Demo" : "EOD";
  const statusLabel = status ? status.toUpperCase() : "CHECK DATA";
  const knownUnreviewedTrades = Math.max(0, input.knownUnreviewedTrades ?? 0);

  const marketTone: DashboardDataConfidenceTone = hasMarketError || status === "degraded" || status === "stale" || status === "unknown" || !status
    ? "warn"
    : "ready";
  const market: DashboardDataConfidenceCheck = {
    id: "market",
    label: "Market freshness",
    value: hasMarketError ? "Unavailable" : statusLabel,
    detail: hasMarketError
      ? "Market overview is recovering; confirm ingest state before acting."
      : `${mode} market snapshot as of ${tradeDate}${refreshAge ? `, ${refreshAge}` : ""}.`,
    href: marketTone === "ready" ? "/dashboard" : "/data",
    tone: marketTone,
  };

  const coverageLabel = percent(input.coveragePct);
  const coverageTone: DashboardDataConfidenceTone = input.fallbackActive
    ? "warn"
    : input.coveragePct == null
      ? "action"
      : input.coveragePct >= 95
        ? "ready"
        : input.coveragePct >= 80
          ? "action"
          : "warn";
  const coverage: DashboardDataConfidenceCheck = {
    id: "coverage",
    label: "Universe coverage",
    value: input.fallbackActive ? "Fallback" : coverageLabel ?? "Check",
    detail: input.fallbackActive
      ? "A fallback market source is active; scanner rankings need confirmation."
      : input.symbolsOnLatestDate != null && input.universeActive != null
        ? `${input.symbolsOnLatestDate.toLocaleString("en-IN")} of ${input.universeActive.toLocaleString("en-IN")} active symbols on the latest session.`
        : "Coverage details are not available from the market health payload.",
    href: "/data",
    tone: coverageTone,
  };

  const accountIssues = Math.max(0, input.accountIssueCount);
  const account: DashboardDataConfidenceCheck = {
    id: "account",
    label: "Account services",
    value: accountIssues > 0 ? `${accountIssues} issue${accountIssues === 1 ? "" : "s"}` : "Ready",
    detail: accountIssues > 0
      ? "Watchlist, journal, or broker services need recovery before counts are fully trusted."
      : "Watchlist, journal, and broker status calls responded.",
    href: accountIssues > 0 ? "/data" : "/watchlist",
    tone: accountIssues > 0 ? "warn" : "ready",
  };

  const alertIssues = Math.max(0, input.alertIssueCount);
  const alerts: DashboardDataConfidenceCheck = alertIssues > 0
    ? {
        id: "alerts",
        label: "Scanner alerts",
        value: `${alertIssues} issue${alertIssues === 1 ? "" : "s"}`,
        detail: "Saved scanner alerts or recent matches could not be confirmed.",
        href: "/alerts",
        tone: "warn",
      }
    : input.alertMatchSymbols > 0
      ? {
          id: "alerts",
          label: "Scanner alerts",
          value: plural(input.alertMatchSymbols, "match", "matches"),
          detail: "Active saved scans have fresh matches waiting for triage.",
          href: "/alerts",
          tone: "action",
        }
      : input.scanAlerts > 0
        ? {
            id: "alerts",
            label: "Scanner alerts",
            value: plural(input.scanAlerts, "armed alert"),
            detail: "Saved alerts loaded; review matches after the next EOD refresh.",
            href: "/alerts",
            tone: "ready",
          }
        : {
            id: "alerts",
            label: "Scanner alerts",
            value: "None",
            detail: "Create saved alerts so discovery does not depend on manual scans.",
            href: "/scanner",
            tone: "empty",
          };

  const journal: DashboardDataConfidenceCheck = input.closedTrades === 0
    ? {
        id: "journal",
        label: "Journal sample",
        value: "No closes",
        detail: "Close or import trades before analytics can validate process quality.",
        href: "/journal",
        tone: "empty",
      }
    : knownUnreviewedTrades > 0
      ? {
          id: "journal",
          label: "Journal sample",
          value: `${knownUnreviewedTrades} due`,
          detail: input.reviewCoveragePartial === true
            ? "Loaded closed trades still need review notes; full history may be larger."
            : `${plural(knownUnreviewedTrades, "closed trade")} need review notes.`,
          href: "/journal?review=needs-review",
          tone: "action",
        }
      : {
          id: "journal",
          label: "Journal sample",
          value: input.reviewCoveragePartial === true ? "Partial" : "Ready",
          detail: input.reviewCoveragePartial === true
            ? "Loaded journal sample is reviewed, but full-history coverage is not confirmed."
            : "Closed trades have review context for dashboard analytics.",
          href: "/journal?tab=analytics",
          tone: input.reviewCoveragePartial === true ? "action" : "ready",
        };

  const broker: DashboardDataConfidenceCheck = input.brokerConnected
    ? {
        id: "import",
        label: "Broker import",
        value: "Connected",
        detail: input.brokerLastSyncedAt
          ? `Read-only import last synced ${input.brokerLastSyncedAt}.`
          : input.brokerStatusLabel || "Read-only import is connected.",
        href: "/settings/broker",
        tone: "ready",
      }
    : {
        id: "import",
        label: "Broker import",
        value: "Manual",
        detail: input.brokerStatusLabel || "Read-only import is not connected, so execution history can be incomplete.",
        href: "/settings/broker",
        tone: "warn",
      };

  const checks = [market, coverage, account, alerts, journal, broker];
  let score = 92;
  if (market.tone === "warn") score -= hasMarketError || status === "degraded" ? 28 : 18;
  if (coverage.tone === "warn") score -= 18;
  if (coverage.tone === "action") score -= 8;
  if (account.tone === "warn") score -= Math.min(28, 16 + accountIssues * 4);
  if (alerts.tone === "warn") score -= 12;
  if (alerts.tone === "empty") score -= 4;
  if (journal.tone === "action") score -= Math.min(14, 6 + knownUnreviewedTrades * 2);
  if (journal.tone === "empty") score -= 8;
  if (broker.tone === "warn") score -= 8;
  if (input.trackedSymbols === 0) score -= 6;

  const scoreValue = clampScore(score);
  const hasWarn = checks.some((check) => check.tone === "warn");
  const hasReviewGap = checks.some((check) => check.tone === "action" || check.tone === "empty");
  const tone = hasWarn ? "warn" : hasReviewGap ? "action" : toneForScore(scoreValue);
  const headline = tone === "ready"
    ? "Data confidence ready"
    : tone === "warn"
      ? "Data confidence needs recovery"
      : "Data confidence needs review";
  const summary = tone === "ready"
    ? "Market freshness, account services, journal sample, alerts, and import checks are usable for planning."
    : tone === "warn"
      ? "Resolve freshness or service gates before trusting rankings, alerts, and risk sizing."
      : "Review the non-blocking confidence gaps before adding new names or risk.";
  const primaryAction = checks.find((check) => check.tone === "warn") ??
    (journal.tone === "action" ? journal : undefined) ??
    checks.find((check) => check.tone === "action") ??
    checks.find((check) => check.tone === "empty") ??
    market;

  return {
    tone,
    score: scoreValue,
    headline,
    summary,
    checks,
    primaryAction,
  };
}
