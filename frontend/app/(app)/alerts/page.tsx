"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listAlerts, updateAlert, deleteAlert, getAlertMatches,
  type ScanAlert, type ScanAlertMatch,
} from "@/lib/api";

// ── Human-readable filter summary ────────────────────────────────────────────

function filterSummary(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  if (filters.price_min != null || filters.price_max != null) {
    parts.push(`Price ${filters.price_min ?? ""}–${filters.price_max ?? ""} ₹`);
  }
  if (filters.pct_change_min != null) parts.push(`Change ≥ ${filters.pct_change_min}%`);
  if (filters.pct_change_max != null) parts.push(`Change ≤ ${filters.pct_change_max}%`);
  if (filters.volume_ratio_min != null) parts.push(`Vol ≥ ${filters.volume_ratio_min}×`);
  if (filters.rsi_min != null || filters.rsi_max != null) {
    parts.push(`RSI ${filters.rsi_min ?? ""}–${filters.rsi_max ?? ""}`);
  }
  if (filters.above_ema20 === true)  parts.push("Above EMA20");
  if (filters.above_ema50 === true)  parts.push("Above EMA50");
  if (filters.above_ema200 === true) parts.push("Above EMA200");
  if (filters.below_ema20 === true)  parts.push("Below EMA20");
  if (filters.below_ema50 === true)  parts.push("Below EMA50");
  if (filters.below_ema200 === true) parts.push("Below EMA200");
  if (filters.new_52w_high === true) parts.push("New 52W High");
  if (filters.new_52w_low === true)  parts.push("New 52W Low");
  if (filters.all_emas_bullish === true) parts.push("All EMAs Bullish");
  if (filters.sector) parts.push(`Sector: ${filters.sector}`);
  return parts.length ? parts.join(" · ") : "No filters";
}

function relativeDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ── Match drawer ──────────────────────────────────────────────────────────────

function MatchDrawer({ alert, onClose }: { alert: ScanAlert; onClose: () => void }) {
  const [matches, setMatches] = useState<ScanAlertMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<ScanAlertMatch | null>(null);

  useEffect(() => {
    getAlertMatches(alert.id)
      .then((m) => {
        setMatches(m);
        if (m.length) setSelectedMatch(m[0]);
      })
      .finally(() => setLoading(false));
  }, [alert.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* Drawer */}
      <div className="w-[420px] bg-white h-full shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0f0ee]">
          <div>
            <div className="text-[14px] font-bold text-[#1c1c1a]">{alert.name}</div>
            <div className="text-[11px] text-[#aaa] mt-0.5">{filterSummary(alert.filters)}</div>
          </div>
          <button onClick={onClose} className="text-[#aaa] hover:text-[#555] p-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Run date tabs */}
        {!loading && matches.length > 0 && (
          <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m)}
                className="flex-shrink-0 text-[11px] font-medium px-3 py-1 rounded-full border transition-colors"
                style={
                  selectedMatch?.id === m.id
                    ? { background: "#5b63f5", color: "#fff", borderColor: "#5b63f5" }
                    : { background: "transparent", color: "#888", borderColor: "#e2e2df" }
                }
              >
                {m.run_date}
                <span className="ml-1.5 opacity-70">({m.match_count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[13px] text-[#aaa]">
              Loading...
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <div className="text-[14px] font-medium text-[#555]">No results yet</div>
              <div className="text-[12px] text-[#aaa] text-center max-w-[260px]">
                This alert runs automatically after the daily market data is ingested (around 4:30 PM IST on trading days).
              </div>
            </div>
          ) : selectedMatch ? (
            <div className="divide-y divide-[#f7f7f5]">
              {selectedMatch.symbols.length === 0 ? (
                <div className="px-5 py-8 text-center text-[13px] text-[#aaa]">
                  No stocks matched on {selectedMatch.run_date}
                </div>
              ) : (
                selectedMatch.symbols.map((s) => (
                  <Link
                    key={s.symbol}
                    href={`/charts/${s.symbol}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-[#fafafa] transition-colors"
                  >
                    <div className="text-[13px] font-semibold text-[#1c1c1a]">{s.symbol}</div>
                    <div className="flex items-center gap-3 text-right">
                      {s.volume_ratio != null && (
                        <span className="text-[11px] text-[#5b63f5] font-medium">{s.volume_ratio}×</span>
                      )}
                      {s.rsi_14 != null && (
                        <span className="text-[11px] text-[#888]">RSI {s.rsi_14.toFixed(0)}</span>
                      )}
                      <div>
                        <div className="text-[13px] font-semibold text-[#1c1c1a]">
                          ₹{s.close.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {s.pct_change != null && (
                          <div
                            className="text-[11px] font-medium"
                            style={{ color: s.pct_change >= 0 ? "#26a65b" : "#e5383b" }}
                          >
                            {s.pct_change >= 0 ? "+" : ""}{s.pct_change.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [alerts, setAlerts]           = useState<ScanAlert[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [drawerAlert, setDrawerAlert] = useState<ScanAlert | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [toggling, setToggling]       = useState<string | null>(null);
  const [toast, setToast]             = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  useEffect(() => {
    listAlerts()
      .then(setAlerts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(alert: ScanAlert) {
    setToggling(alert.id);
    try {
      const updated = await updateAlert(alert.id, { is_active: !alert.is_active });
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      showToast("Failed to update alert");
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(alert: ScanAlert) {
    if (!confirm(`Delete alert "${alert.name}"?`)) return;
    setDeleting(alert.id);
    try {
      await deleteAlert(alert.id);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      showToast("Alert deleted");
    } catch {
      showToast("Failed to delete alert");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-full bg-[#f2f2f0]">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1a] text-white text-[13px] px-4 py-2 rounded-lg shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {drawerAlert && (
        <MatchDrawer alert={drawerAlert} onClose={() => setDrawerAlert(null)} />
      )}

      <div className="px-5 pt-5 pb-4">
        <div className="text-[20px] font-semibold text-[#1c1c1a] tracking-tight">Scan Alerts</div>
        <div className="text-[13px] text-[#888] mt-0.5">
          Saved scans that run automatically after market close each trading day
        </div>
      </div>

      {/* How to create */}
      <div className="mx-5 mb-4 bg-[#eeeffe] border border-[#d0d3fb] rounded-[10px] px-4 py-3">
        <div className="text-[12px] font-semibold text-[#5b63f5] mb-0.5">How to create an alert</div>
        <div className="text-[12px] text-[#555] leading-relaxed">
          Go to the{" "}
          <Link href="/scanner" className="underline font-medium text-[#5b63f5]">Scanner</Link>
          , build your filter conditions, then click{" "}
          <span className="font-medium">&quot;Save as Alert&quot;</span>{" "}
          in the toolbar. Results will appear here after market close.
        </div>
      </div>

      {loading ? (
        <div className="px-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-40 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-64" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-5 text-[13px] text-red-400">{error}</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-12 h-12 rounded-full bg-[#eeeffe] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3v3M11 16v3M3 11h3M16 11h3" stroke="#5b63f5" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="11" cy="11" r="4" stroke="#5b63f5" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="text-[14px] font-medium text-[#555]">No alerts yet</div>
          <div className="text-[12px] text-[#aaa]">Create one from the Scanner page</div>
          <Link
            href="/scanner"
            className="mt-1 text-[13px] font-medium text-[#5b63f5] bg-[#eeeffe] px-4 py-1.5 rounded-full"
          >
            Go to Scanner
          </Link>
        </div>
      ) : (
        <div className="px-5 pb-5 space-y-2.5">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white border border-[#e2e2df] rounded-[10px] px-4 py-3.5"
              style={!alert.is_active ? { opacity: 0.55 } : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#1c1c1a] truncate">{alert.name}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={
                        alert.is_active
                          ? { background: "#edfaf3", color: "#26a65b" }
                          : { background: "#f5f5f3", color: "#aaa" }
                      }
                    >
                      {alert.is_active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#aaa] mt-0.5 truncate">
                    {filterSummary(alert.filters)}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggle(alert)}
                    disabled={toggling === alert.id}
                    title={alert.is_active ? "Pause alert" : "Resume alert"}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#aaa] hover:text-[#555] hover:bg-[#f5f5f3] transition-colors"
                  >
                    {alert.is_active ? (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <rect x="2" y="2" width="3.5" height="9" rx="1" fill="currentColor" />
                        <rect x="7.5" y="2" width="3.5" height="9" rx="1" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M3 2l8 4.5L3 11V2z" fill="currentColor" />
                      </svg>
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(alert)}
                    disabled={deleting === alert.id}
                    title="Delete alert"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#aaa] hover:text-[#e5383b] hover:bg-[#fef2f2] transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3.5l-.7 7a.5.5 0 01-.5.5H3.7a.5.5 0 01-.5-.5l-.7-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Footer row */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#f7f7f5]">
                <div className="flex items-center gap-3 text-[11px] text-[#aaa]">
                  <span>Last run: {relativeDate(alert.last_run_at)}</span>
                  {alert.last_match_count != null && (
                    <span>
                      <span
                        className="font-semibold"
                        style={{ color: alert.last_match_count > 0 ? "#5b63f5" : "#aaa" }}
                      >
                        {alert.last_match_count}
                      </span>
                      {" "}match{alert.last_match_count !== 1 ? "es" : ""}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setDrawerAlert(alert)}
                  className="text-[11px] font-medium text-[#5b63f5] hover:underline"
                >
                  View results →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
