"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAiPatterns,
  getBrokerStatus,
  getDataHealth,
  getJournalEntries,
  getJournalStats,
  type AiPatterns,
  type DataHealth,
  type JournalStats,
} from "@/lib/api";
import { Card, DataProvenanceBadge, EyebrowLabel, Num } from "@/components/ui";

type BrokerStatus = Awaited<ReturnType<typeof getBrokerStatus>>;

type CenterState = {
  dataHealth: DataHealth | null;
  broker: BrokerStatus | null;
  journalStats: JournalStats | null;
  aiPatterns: AiPatterns | null;
  closedTrades: number;
  reviewedTrades: number;
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
    broker: null,
    journalStats: null,
    aiPatterns: null,
    closedTrades: 0,
    reviewedTrades: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [dataHealth, broker, journalStats, journal, aiPatterns] = await Promise.all([
          getDataHealth().catch(() => null),
          getBrokerStatus().catch(() => fallbackBroker),
          getJournalStats().catch(() => null),
          getJournalEntries({ limit: 250 }).catch(() => ({ entries: [], total: 0 })),
          getAiPatterns().catch(() => null),
        ]);

        const closed = journal.entries.filter(entry => entry.status === "closed");
        const reviewed = closed.filter(entry => Boolean(entry.lessons?.trim()));

        setState({
          dataHealth,
          broker,
          journalStats,
          aiPatterns,
          closedTrades: closed.length,
          reviewedTrades: reviewed.length,
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
    const reviewCoverage = state.closedTrades ? Math.round((state.reviewedTrades / state.closedTrades) * 100) : 0;

    if (!health) {
      next.push({
        title: "Check market data API",
        detail: "The freshness endpoint did not return data, so scanner and dashboard confidence cannot be shown.",
        href: "/dashboard",
      });
    } else if (health.status !== "healthy") {
      next.push({
        title: health.status === "degraded" ? "Review latest ingest fallback" : "Refresh stale market data",
        detail: "Scanner, charts, and dashboard may be using the latest complete market day instead of the newest ingest.",
        href: "/scanner",
      });
    }

    if (!broker.connected || broker.token_expired) {
      next.push({
        title: broker.token_expired ? "Reconnect broker token" : "Keep broker in simulated mode or connect it",
        detail: "Broker connections are read-only/import only for private beta. Order tickets remain simulated journal capture.",
        href: "/settings/broker",
      });
    }

    if (state.closedTrades < 3) {
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
  const broker = state.broker ?? fallbackBroker;
  const coveragePct = health?.symbols_on_latest_date != null && health.universe_active
    ? Math.round((health.symbols_on_latest_date / health.universe_active) * 100)
    : null;
  const missingIndicators = (health?.indicators_missing.rsi_14 ?? 0) + (health?.indicators_missing.ema_200 ?? 0);
  const liveMarket = health?.live_market ?? null;

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

      <div className="data-health-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <HealthTile
          label="Market data"
          value={health?.status ? health.status.toUpperCase() : "UNKNOWN"}
          detail={health?.latest_trade_date ? `Latest complete trade date ${health.latest_trade_date}.` : "Freshness endpoint unavailable."}
          status={health?.status === "healthy" ? "good" : health?.status === "degraded" ? "warn" : "bad"}
        />
        <HealthTile
          label="Universe coverage"
          value={coveragePct != null ? `${coveragePct}%` : "UNKNOWN"}
          detail={`${fmtNumber(health?.symbols_on_latest_date)} symbols on latest date out of ${fmtNumber(health?.universe_active)} active.`}
          status={coveragePct == null ? "bad" : coveragePct >= 95 ? "good" : coveragePct >= 80 ? "warn" : "bad"}
        />
        <HealthTile
          label="Broker channel"
          value={broker.connected && !broker.token_expired ? "READY" : broker.token_expired ? "TOKEN EXPIRED" : "SIMULATED"}
          detail={broker.connected ? `${broker.broker ?? "Broker"} connected read-only for import.` : "Order capture remains simulated; broker import is optional."}
          status={broker.connected && !broker.token_expired ? "good" : broker.token_expired ? "bad" : "warn"}
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
              ["Last successful EOD", fmtDate(health?.last_successful_eod_date ?? health?.latest_trade_date)],
              ["Source", health?.provider?.source_name ?? "Unknown"],
              ["Fallback active", health?.fallback_active ? "Yes" : "No"],
              ["Refresh age", health?.hours_since_refresh != null ? `${health.hours_since_refresh.toFixed(1)} hours` : "Not available"],
              ["Last bhavcopy", health?.last_bhavcopy?.status ? `${health.last_bhavcopy.status} · ${health.last_bhavcopy.rows_ingested ?? 0} rows` : "Not available"],
              ["RSI missing", fmtNumber(health?.indicators_missing.rsi_14)],
              ["EMA 200 missing", fmtNumber(health?.indicators_missing.ema_200)],
              ["Last ingest run", health?.last_run.id ?? "Not available"],
              ["Last ingest errors", fmtNumber(health?.last_run.errors)],
              ["Kite API key", liveMarket?.api_key_configured ? "Configured" : "Missing"],
              ["Kite access token", liveMarket?.access_token_valid ? "Valid for current session" : liveMarket?.access_token_configured ? "Configured, not validated" : "Missing"],
              ["Open trades", fmtNumber(state.journalStats?.open_trades)],
              ["AI pattern readiness", state.aiPatterns?.ready ? "Ready" : "Needs more closed trades"],
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
        <h2 className="heading-card" style={{ marginBottom: 14 }}>Product surface map</h2>
        <div className="data-surface-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {[
            ["Scanner", "Uses the latest complete market day and indicator completeness to decide whether presets are trustworthy.", "/scanner"],
            ["Charts", "Shows EOD provenance directly in the chart toolbar before planning.", "/charts/RELIANCE"],
            ["Dashboard", "Separates live sector-index movement from latest complete session breadth.", "/dashboard"],
            ["Broker", "Broker beta is read-only/import only; simulated order capture still records review context.", "/settings/broker"],
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
