"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAiPatterns,
  getBrokerStatus,
  getDataHealth,
  getDataRuns,
  getJournalEntries,
  getJournalStats,
  type AiPatterns,
  type DataHealth,
  type DataRun,
  type JournalStats,
} from "@/lib/api";
import { Card, DataProvenanceBadge, EyebrowLabel, Num } from "@/components/ui";
import { checkApiReachability } from "@/lib/api-reachability";
import { marketDataHealthPresentation } from "@/lib/data-health-copy";
import { formatMarketDataSource } from "@/lib/data-copy";
import type { ApiReachability } from "@/lib/data-mode";
import { captureAccountData, uniqueAccountIssues, type AccountDataIssue } from "@/lib/account-data-status";
import { brokerOrderGatePresentation } from "@/lib/broker-safety";

type BrokerStatus = Awaited<ReturnType<typeof getBrokerStatus>>;

type CenterState = {
  dataHealth: DataHealth | null;
  apiReachable: ApiReachability;
  broker: BrokerStatus | null;
  journalStats: JournalStats | null;
  aiPatterns: AiPatterns | null;
  aiPatternsError: string;
  dataRuns: DataRun[];
  dataRunsError: string;
  closedTrades: number;
  reviewedTrades: number;
  accountIssues: AccountDataIssue[];
};

const fallbackBroker: BrokerStatus = {
  connected: false,
  broker: null,
  mode: "simulated",
  has_api_key: false,
  has_token: false,
  token_expired: false,
  connected_at: null,
  token_expires_at: null,
};

function fmtNumber(value: number | null | undefined) {
  if (value == null) return "Not available";
  return value.toLocaleString("en-IN");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return value;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(value: number | null | undefined) {
  if (value == null) return "Not available";
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function statusColor(status: "good" | "warn" | "bad") {
  if (status === "good") return "var(--gain)";
  if (status === "warn") return "var(--warn)";
  return "var(--loss)";
}

function HealthTile({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: "good" | "warn" | "bad";
}) {
  const color = statusColor(status);
  return (
    <div style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div className="label">{label}</div>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      </div>
      <Num style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6, display: "block" }}>{value}</Num>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>{detail}</div>
    </div>
  );
}

function ActionItem({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface-2)",
        textDecoration: "none",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>{detail}</div>
    </Link>
  );
}

export default function DataFreshnessPage() {
  const [state, setState] = useState<CenterState>({
    dataHealth: null,
    apiReachable: "unknown",
    broker: null,
    journalStats: null,
    aiPatterns: null,
    aiPatternsError: "",
    dataRuns: [],
    dataRunsError: "",
    closedTrades: 0,
    reviewedTrades: 0,
    accountIssues: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [apiReachable, dataHealth, dataRunsResult, brokerResult, journalStatsResult, journalResult, aiPatterns] = await Promise.all([
          checkApiReachability(),
          getDataHealth().catch(() => null),
          getDataRuns(5)
            .then(runs => ({ runs, error: "" }))
            .catch(error => ({
              runs: [],
              error: error instanceof Error ? error.message : "Data refresh run history is temporarily unavailable.",
            })),
          captureAccountData(
            getBrokerStatus(),
            { id: "broker", label: "Broker status", href: "/settings/broker" },
            "Broker status is temporarily unavailable.",
          ),
          captureAccountData(
            getJournalStats(),
            { id: "journal", label: "Journal stats", href: "/journal" },
            "Journal stats are temporarily unavailable.",
          ),
          captureAccountData(
            getJournalEntries({ limit: 250 }),
            { id: "journal", label: "Journal entries", href: "/journal" },
            "Journal entries are temporarily unavailable.",
          ),
          getAiPatterns()
            .then(patterns => ({ patterns, error: "" }))
            .catch(error => ({
              patterns: null,
              error: error instanceof Error ? error.message : "Trade pattern review is temporarily unavailable.",
            })),
        ]);

        const accountIssues = uniqueAccountIssues([brokerResult.issue, journalStatsResult.issue, journalResult.issue]);
        const broker = brokerResult.data ?? fallbackBroker;
        const journalStats = journalStatsResult.data;
        const journal = journalResult.data ?? { entries: [], total: 0 };
        const closed = journal.entries.filter(entry => entry.status === "closed");
        const reviewed = closed.filter(entry => Boolean(entry.lessons?.trim()));

        setState({
          dataHealth,
          apiReachable,
          broker,
          journalStats,
          aiPatterns: aiPatterns.patterns,
          aiPatternsError: aiPatterns.error,
          dataRuns: dataRunsResult.runs,
          dataRunsError: dataRunsResult.error,
          closedTrades: closed.length,
          reviewedTrades: reviewed.length,
          accountIssues,
        });
        setLoadedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load freshness data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const actions = useMemo(() => {
    const next: { title: string; detail: string; href: string }[] = [];
    const health = state.dataHealth;
    const broker = state.broker ?? fallbackBroker;
    const brokerIssue = state.accountIssues.find(issue => issue.id === "broker");
    const journalIssue = state.accountIssues.find(issue => issue.id === "journal");
    const reviewCoverage = state.closedTrades ? Math.round((state.reviewedTrades / state.closedTrades) * 100) : 0;

    if (state.apiReachable === "down") {
      next.push({
        title: "Restore market data service",
        detail: "The platform is reachable, but the market data API is down. Scanner, dashboard, and charts need service recovery before data can be trusted.",
        href: "/data",
      });
    } else if (!health) {
      next.push({
        title: "Check market data API",
        detail: "The freshness endpoint did not return data, so scanner and dashboard confidence cannot be shown.",
        href: "/dashboard",
      });
    } else if (health.status !== "healthy") {
      next.push({
        title: health.status === "degraded" ? "Review latest ingest fallback" : "Refresh stale market data",
        detail: "Scanner, charts, and dashboard may be using the latest available session instead of the newest ingest.",
        href: "/scanner",
      });
    }

    if (state.accountIssues.length > 0) {
      next.push({
        title: "Check account data services",
        detail: `${state.accountIssues.map(issue => issue.label).join(", ")} unavailable. Saved account data is not being counted as empty.`,
        href: "/data",
      });
    }

    if (state.dataRunsError) {
      next.push({
        title: "Recheck refresh run history",
        detail: "Recent ingest activity cannot be confirmed right now; do not treat the run list as empty.",
        href: "/data",
      });
    }

    if (state.aiPatternsError) {
      next.push({
        title: "Recheck trade review analytics",
        detail: "Pattern readiness cannot be confirmed right now; closed trades are not being counted as insufficient.",
        href: "/journal?tab=ai",
      });
    }

    if (brokerIssue) {
      next.push({
        title: "Recheck broker status service",
        detail: "Broker import state cannot be confirmed right now; avoid treating this as disconnected.",
        href: "/settings/broker",
      });
    } else if (!broker.connected || broker.token_expired) {
      next.push({
        title: broker.token_expired ? "Reconnect broker token" : "Use journal capture or connect a broker",
        detail: "Broker import is read-only. Order tickets remain journal capture drafts.",
        href: "/settings/broker",
      });
    }

    if (journalIssue) {
      next.push({
        title: "Recheck journal service",
        detail: "Closed-trade and review coverage metrics are paused until journal data responds.",
        href: "/journal",
      });
    } else if (state.closedTrades < 3) {
      next.push({
        title: "Build AI review base",
        detail: "Close at least 3 trades before relying on journal-wide pattern analysis.",
        href: "/journal",
      });
    } else if (reviewCoverage < 70) {
      next.push({
        title: "Improve journal review coverage",
        detail: `${reviewCoverage}% of closed trades have lessons. Push this toward 70% before treating AI review as grounded.`,
        href: "/journal",
      });
    }

    return next.slice(0, 4);
  }, [state]);

  const health = state.dataHealth;
  const marketHealth = marketDataHealthPresentation(health, state.apiReachable);
  const broker = state.broker ?? fallbackBroker;
  const coveragePct = health?.symbols_on_latest_date != null && health.universe_active
    ? Math.round((health.symbols_on_latest_date / health.universe_active) * 100)
    : null;
  const missingIndicators = (health?.indicators_missing.rsi_14 ?? 0) + (health?.indicators_missing.ema_200 ?? 0);
  const liveMarket = health?.live_market ?? null;
  const brokerUnavailable = state.accountIssues.some(issue => issue.id === "broker");
  const brokerGate = brokerOrderGatePresentation(broker, { unavailable: brokerUnavailable });

  if (loading) {
    return (
      <div style={{ minHeight: "100%", padding: "20px 24px" }}>
        <div style={{ height: 150, borderRadius: "var(--radius-lg)", background: "var(--surface-1)", border: "1px solid var(--border-subtle)", marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {[1, 2, 3, 4].map(item => (
            <div key={item} style={{ height: 130, borderRadius: "var(--radius-lg)", background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: "22px 24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015)), var(--surface-1)", boxShadow: "var(--shadow-panel)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
          <div>
            <EyebrowLabel style={{ marginBottom: 8 }}>Data trust</EyebrowLabel>
            <h1 className="app-page-title" style={{ marginBottom: 6 }}>Know what is fresh before you trade.</h1>
            <p style={{ maxWidth: 760, fontSize: 13, lineHeight: 1.65, color: "var(--text-secondary)" }}>
              One place to inspect market ingest health, symbol coverage, broker import state, and journal review readiness before moving from analysis to planning.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <DataProvenanceBadge
              kind={health?.mode === "demo" ? "demo" : health?.status === "degraded" || health?.status === "stale" || health?.fallback_active ? "fallback" : "eod"}
              asOf={health?.latest_trade_date ?? null}
            />
            {loadedAt && <span className="caption">Checked <Num>{loadedAt}</Num></span>}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", color: "var(--loss)", background: "var(--loss-subtle)", border: "1px solid var(--border-subtle)" }}>
          {error}
        </div>
      )}

      {state.accountIssues.length > 0 && (
        <Card padding="md" data-testid="data-account-data-status">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 14, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div className="label" style={{ color: "var(--warn)", marginBottom: 6 }}>Account data unavailable</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 10 }}>
                Account workflow metrics are paused until these services respond. Existing broker, journal, and workflow data are not being counted as empty.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {state.accountIssues.map(issue => (
                  <span key={issue.id} className="workspace-pill" title={issue.message}>{issue.label}</span>
                ))}
              </div>
            </div>
            <Link href="/dashboard" className="workspace-chip-button" style={{ textDecoration: "none" }}>
              Dashboard
            </Link>
          </div>
        </Card>
      )}

      <div className="data-health-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <HealthTile
          label="Market data"
          value={marketHealth.value}
          detail={marketHealth.detail}
          status={marketHealth.status}
        />
        <HealthTile
          label="Universe coverage"
          value={coveragePct != null ? `${coveragePct}%` : "NOT AVAILABLE"}
          detail={`${fmtNumber(health?.symbols_on_latest_date)} symbols on latest date out of ${fmtNumber(health?.universe_active)} active.`}
          status={coveragePct == null ? "bad" : coveragePct >= 95 ? "good" : coveragePct >= 80 ? "warn" : "bad"}
        />
        <HealthTile
          label="Broker channel"
          value={state.accountIssues.some(issue => issue.id === "broker") ? "UNAVAILABLE" : broker.connected && !broker.token_expired ? "READY" : broker.token_expired ? "TOKEN EXPIRED" : "SIMULATED"}
          detail={state.accountIssues.some(issue => issue.id === "broker") ? "Broker import state cannot be confirmed right now." : broker.connected ? `${broker.broker ?? "Broker"} connected read-only for import.` : "Order capture remains journal-only; broker import is optional."}
          status={state.accountIssues.some(issue => issue.id === "broker") || broker.token_expired ? "bad" : broker.connected ? "good" : "warn"}
        />
        <HealthTile
          label="Broker order gate"
          value={brokerGate.value}
          detail={brokerGate.detail}
          status={brokerGate.status}
        />
        <HealthTile
          label="Kite live feed"
          value={liveMarket?.access_token_valid ? "TOKEN VALID" : liveMarket?.access_token_configured ? "CHECK TOKEN" : "NO TOKEN"}
          detail={liveMarket?.stream_connected ? `${liveMarket.subscriber_count} active stream subscriber${liveMarket.subscriber_count === 1 ? "" : "s"}.` : liveMarket?.last_error || "Live quotes need the daily Kite access token."}
          status={liveMarket?.access_token_valid && liveMarket.stream_connected ? "good" : liveMarket?.access_token_configured ? "warn" : "bad"}
        />
      </div>

      <div className="data-detail-grid" style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
        <Card padding="lg">
          <h2 className="heading-card" style={{ marginBottom: 14 }}>Freshness details</h2>
          <div className="data-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {[
              ["Latest trade date", fmtDate(health?.latest_trade_date)],
              ["Last successful refresh", fmtDate(health?.last_successful_eod_date ?? health?.latest_trade_date)],
              ["Source", formatMarketDataSource(health?.provider?.source_name, "Market data")],
              ["Fallback active", health?.fallback_active ? "Yes" : "No"],
              ["Refresh age", health?.hours_since_refresh != null ? `${health.hours_since_refresh.toFixed(1)} hours` : "Not available"],
              ["Latest exchange file", health?.last_bhavcopy?.status ? `${health.last_bhavcopy.status} · ${health.last_bhavcopy.rows_ingested ?? 0} rows` : "Not available"],
              ["RSI missing", fmtNumber(health?.indicators_missing.rsi_14)],
              ["EMA 200 missing", fmtNumber(health?.indicators_missing.ema_200)],
              ["Last ingest run", health?.last_run.id ?? "Not available"],
              ["Last ingest errors", fmtNumber(health?.last_run.errors)],
              ["Kite app", liveMarket?.api_key_configured ? "Configured" : "Missing"],
              ["Kite access token", liveMarket?.access_token_valid ? "Valid for current session" : liveMarket?.access_token_configured ? "Configured, not validated" : "Missing"],
              ["Broker order gate", `${brokerGate.value} · ${brokerGate.detail}`],
              ["Open trades", state.accountIssues.some(issue => issue.id === "journal") ? "Unavailable" : fmtNumber(state.journalStats?.open_trades)],
              ["AI pattern readiness", state.accountIssues.some(issue => issue.id === "journal") || state.aiPatternsError ? "Unavailable" : state.aiPatterns?.ready ? "Ready" : "Needs more closed trades"],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: "11px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                <div className="label" style={{ marginBottom: 4 }}>{label}</div>
                <Num style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{value}</Num>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: missingIndicators > 0 ? "var(--warn-subtle)" : "var(--gain-subtle)" }}>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: missingIndicators > 0 ? "var(--warn)" : "var(--gain)" }}>
              {missingIndicators > 0
                ? `${missingIndicators.toLocaleString("en-IN")} indicator values are missing across RSI 14 and EMA 200 checks. Scanner presets may be narrower until the next ingest backfills them.`
                : "Core scanner indicators are present for the current health snapshot."}
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <h2 className="heading-card" style={{ marginBottom: 14 }}>Workflow status links</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.length ? actions.map(action => (
              <ActionItem key={action.title} {...action} />
            )) : (
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)", fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                Data freshness, broker state, and journal review grounding are all in a usable state for the current snapshot.
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div>
            <h2 className="heading-card" style={{ marginBottom: 6 }}>Recent refresh runs</h2>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
              Latest ingest activity from the backend run log.
            </div>
          </div>
          {state.dataRunsError && (
            <span className="workspace-pill" style={{ color: "var(--warn)" }}>History unavailable</span>
          )}
        </div>

        {state.dataRunsError ? (
          <div data-testid="data-runs-unavailable" style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--warn-subtle)", color: "var(--warn)", fontSize: 13, lineHeight: 1.6 }}>
            {state.dataRunsError} Existing refresh history is not being counted as empty.
          </div>
        ) : state.dataRuns.length ? (
          <div className="data-runs-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr repeat(3, minmax(0, 0.7fr))", gap: 10 }}>
            {state.dataRuns.map(run => (
              <div key={run.run_id} style={{ display: "contents" }}>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                  <div className="label" style={{ marginBottom: 4 }}>Started</div>
                  <Num style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtDateTime(run.started_at)}</Num>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                  <div className="label" style={{ marginBottom: 4 }}>Duration</div>
                  <Num style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtDuration(run.duration_s)}</Num>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                  <div className="label" style={{ marginBottom: 4 }}>Events</div>
                  <Num style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{fmtNumber(run.event_count)}</Num>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: run.error_count ? "var(--warn-subtle)" : "var(--surface-2)" }}>
                  <div className="label" style={{ marginBottom: 4 }}>Errors</div>
                  <Num style={{ fontSize: 13, fontWeight: 700, color: run.error_count ? "var(--warn)" : "var(--text-primary)" }}>{fmtNumber(run.error_count)}</Num>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            No refresh runs have been recorded yet.
          </div>
        )}
      </Card>

      <Card padding="lg">
        <h2 className="heading-card" style={{ marginBottom: 14 }}>Product surface map</h2>
        <div className="data-surface-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {[
            ["Scanner", "Uses the latest available session and indicator completeness to decide whether presets are trustworthy.", "/scanner"],
            ["Charts", "Shows source and freshness directly in the chart toolbar before planning.", "/charts/RELIANCE"],
            ["Dashboard", "Shows market pulse, sector participation, and freshness without mixing data sources.", "/dashboard"],
            ["Broker", "Broker import is read-only/import only; journal capture still records review context.", "/settings/broker"],
          ].map(([title, detail, href]) => (
            <Link key={title} href={href} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)", textDecoration: "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>{detail}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
