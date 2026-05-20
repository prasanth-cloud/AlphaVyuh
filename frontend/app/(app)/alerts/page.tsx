"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteAlert,
  getRecentAlertMatches,
  listAlerts,
  updateAlert,
  type ScanAlert,
  type ScanAlertMatch,
} from "@/lib/api";
import { DataProvenanceBadge, DataTable, DataTableHead, EmptyState, Num, Td, Th, Tr } from "@/components/ui";

function topSymbols(match: ScanAlertMatch) {
  return match.symbols.slice(0, 6);
}

function runStatusLabel(status?: string) {
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  if (status === "success") return "Checked";
  return "Waiting";
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<ScanAlert[]>([]);
  const [matches, setMatches] = useState<ScanAlertMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadAlerts() {
    setLoading(true);
    setMessage("");
    setLoadError(null);
    try {
      const [activeAlerts, recentMatches] = await Promise.all([
        listAlerts(),
        getRecentAlertMatches(),
      ]);
      setAlerts(activeAlerts);
      setMatches(recentMatches);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Scan alerts are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  const latestRunDate = useMemo(() => {
    return matches.map((match) => match.run_date).sort().at(-1) ?? null;
  }, [matches]);

  async function toggleAlert(alert: ScanAlert) {
    try {
      const updated = await updateAlert(alert.id, { is_active: !alert.is_active });
      setAlerts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setLoadError(null);
      setMessage(updated.is_active ? "EOD scan alert resumed" : "EOD scan alert paused");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update alert");
    }
  }

  async function removeAlert(alert: ScanAlert) {
    try {
      await deleteAlert(alert.id);
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
      setMatches((current) => current.filter((match) => match.alert_id !== alert.id));
      setLoadError(null);
      setMessage("EOD scan alert removed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete alert");
    }
  }

  return (
    <div className="workspace-page" style={{ gap: 16 }}>
      <div className="workspace-hero" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Alerts</div>
          <h1 className="heading-card" style={{ fontSize: 24, marginBottom: 6 }}>EOD scan matches</h1>
          <p className="workspace-card-copy" style={{ maxWidth: 760 }}>
            Review saved scans after the latest complete market day is loaded. AlphaVyuh shows matched names for review; execution stays outside AlphaVyuh.
          </p>
        </div>
        <div className="workspace-toolbar-group">
          {latestRunDate && <DataProvenanceBadge kind="eod" asOf={latestRunDate} compact />}
          <Link className="workspace-chip-button active" href="/scanner">
            Open scanner
          </Link>
        </div>
      </div>

      {message && (
        <div className="workspace-card-copy" style={{ color: "var(--accent)", padding: "0 4px" }}>
          {message}
        </div>
      )}

      {loadError && (
        <div
          className="workspace-card"
          data-testid="scan-alerts-unavailable"
          style={{ borderColor: "rgba(217,119,6,0.24)", background: "rgba(217,119,6,0.08)" }}
        >
          <div className="label" style={{ color: "var(--warn)", marginBottom: 6 }}>Scan alerts unavailable</div>
          <div className="workspace-card-copy" style={{ color: "var(--text-primary)" }}>
            {loadError}
          </div>
        </div>
      )}

      <div className="workspace-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="workspace-toolbar" style={{ minHeight: 58 }}>
          <div>
            <div className="workspace-card-title">Saved scan alerts</div>
            <div className="workspace-card-copy">
              {loading
                ? "Loading EOD alert state..."
                : loadError
                  ? "Saved scans could not be confirmed"
                  : `${alerts.length} saved ${alerts.length === 1 ? "scan" : "scans"}`}
            </div>
          </div>
          <Link className="workspace-chip-button" href="/scanner">
            Add from scanner
          </Link>
        </div>

        {loadError ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="Saved scan alerts unavailable"
              description="Your saved scans are not being treated as empty while the alert service is unavailable."
            />
          </div>
        ) : alerts.length === 0 && !loading ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="No saved scan alerts yet"
              description="Run a scanner preset, then add an EOD alert so the scan can be checked after the latest complete market day."
              action={{ label: "Open scanner", onClick: () => { window.location.href = "/scanner"; } }}
            />
          </div>
        ) : (
          <DataTable style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderBottom: "none" }}>
            <DataTableHead>
              <Th width={260}>Scan</Th>
              <Th width={120}>Status</Th>
              <Th width={150}>Last run</Th>
              <Th align="right" width={130}>Matches</Th>
              <Th width={210}>Controls</Th>
            </DataTableHead>
            <tbody>
              {alerts.map((alert) => (
                <Tr key={alert.id}>
                  <Td emphasized>
                    <div className="mono" style={{ fontSize: 13, color: "var(--text-primary)" }}>{alert.name}</div>
                    <div className="caption">{alert.sort_by} · {alert.sort_order}</div>
                  </Td>
                  <Td>
                    <span className="workspace-pill" style={{ color: alert.is_active ? "var(--gain)" : "var(--text-tertiary)" }}>
                      {alert.is_active ? "Active" : "Paused"}
                    </span>
                    {alert.last_run_status && alert.last_run_status !== "waiting" && (
                      <div className="caption" style={{ marginTop: 6 }}>
                        Last check: {runStatusLabel(alert.last_run_status)}
                      </div>
                    )}
                    {alert.last_error && (
                      <div className="caption" style={{ color: "var(--warning)", marginTop: 4 }}>
                        {alert.last_error}
                      </div>
                    )}
                  </Td>
                  <Td mono>{alert.last_run_at ? new Date(alert.last_run_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Waiting for EOD"}</Td>
                  <Td align="right" mono emphasized>
                    {alert.last_match_count == null ? "—" : <Num>{alert.last_match_count.toLocaleString("en-IN")}</Num>}
                  </Td>
                  <Td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="workspace-chip-button" onClick={() => toggleAlert(alert)}>
                        {alert.is_active ? "Pause" : "Resume"}
                      </button>
                      <button className="workspace-chip-button" onClick={() => removeAlert(alert)}>
                        Delete
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>

      <div className="workspace-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="workspace-toolbar" style={{ minHeight: 58 }}>
          <div>
            <div className="workspace-card-title">Latest EOD digest</div>
            <div className="workspace-card-copy">
              {loadError ? "Latest scan alert digest could not be confirmed." : latestRunDate ? `Most recent scan alert run: ${latestRunDate}` : "Waiting for latest EOD data."}
            </div>
          </div>
        </div>

        {loadError ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="EOD digest unavailable"
              description="Recent scan matches are not being treated as empty while the alert service is unavailable."
            />
          </div>
        ) : matches.length === 0 && !loading ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              title="No EOD matches yet"
              description="When a saved scan is checked after market data refresh, the latest match list will appear here."
            />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, padding: 16 }}>
            {matches.map((match) => (
              <div
                key={`${match.alert_id}-${match.run_date}`}
                className="workspace-card-muted"
                style={{ padding: 16, borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div className="label" style={{ marginBottom: 5 }}>{match.scan_alerts?.name ?? "Saved scan"}</div>
                    <div className="heading-card" style={{ fontSize: 18 }}>
                      {match.run_status && match.run_status !== "success"
                        ? `${runStatusLabel(match.run_status)} on ${match.run_date}`
                        : <><Num>{match.match_count.toLocaleString("en-IN")}</Num> stocks matched on {match.run_date}</>}
                    </div>
                    {match.error_message && (
                      <div className="workspace-card-copy" style={{ marginTop: 5, color: "var(--warning)" }}>
                        {match.error_message}
                      </div>
                    )}
                  </div>
                  <DataProvenanceBadge kind="eod" asOf={match.run_date} compact />
                </div>
                <div className="workspace-pill-row">
                  {topSymbols(match).map((symbol) => (
                    <Link key={symbol.symbol} className="workspace-pill" href={`/charts/${symbol.symbol}`}>
                      <span className="mono" style={{ color: "var(--text-primary)" }}>{symbol.symbol}</span>
                      <span className="mono" style={{ color: (symbol.pct_change ?? 0) >= 0 ? "var(--gain)" : "var(--loss)" }}>
                        {(symbol.pct_change ?? 0) >= 0 ? "+" : ""}{symbol.pct_change?.toFixed(2) ?? "0.00"}%
                      </span>
                    </Link>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Link className="workspace-chip-button active" href="/scanner">
                    Review in scanner
                  </Link>
                  <Link className="workspace-chip-button" href="/watchlist">
                    Open watchlist
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="workspace-card-copy">
        EOD scan alerts are review aids. They are not live market data, trade execution, or investment advice.
      </div>
    </div>
  );
}
