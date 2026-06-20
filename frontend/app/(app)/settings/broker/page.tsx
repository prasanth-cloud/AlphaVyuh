"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, LockKeyhole, PlugZap, ShieldCheck, ServerCog } from "lucide-react";
import {
  getBrokerStatus,
  getKiteTokenHealth,
  getZerodhaLoginUrl,
  importBrokerTrades,
  runBrokerReadOnlySmoke,
  startBrokerConnect,
} from "@/lib/api";
import { EyebrowLabel, Num } from "@/components/ui";
import { accountDataErrorMessage } from "@/lib/account-data-status";
import { BROKER_EXECUTION_APPROVAL_ITEMS, brokerReadOnlyChecklist, brokerReadOnlyEvidenceSummary } from "@/lib/broker-safety";

type BrokerState = Awaited<ReturnType<typeof getBrokerStatus>>;
type BrokerCard = {
  id: "zerodha" | "upstox" | "dhan";
  name: string;
  status: "active" | "next" | "planned";
  auth: string;
  sessionPolicy: string;
  scope: string;
};

const BROKERS: BrokerCard[] = [
  {
    id: "zerodha",
    name: "Zerodha Kite",
    status: "active",
    auth: "Kite Connect request-token flow",
    sessionPolicy: "Daily broker session expires around 06:00 IST",
    scope: "Profile, holdings, positions, orderbook, tradebook, and filled-trade import",
  },
  {
    id: "upstox",
    name: "Upstox",
    status: "next",
    auth: "OAuth 2.0 authorization-code flow",
    sessionPolicy: "Standard session expires at 03:30 AM next day; extended read mode needs approval",
    scope: "OAuth, profile, holdings, and filled-trade import where broker data is available",
  },
  {
    id: "dhan",
    name: "Dhan",
    status: "planned",
    auth: "Access-token flow, partner path for multi-user platforms",
    sessionPolicy: "User-controlled validity from 8 hours to 30 days",
    scope: "Good candidate after Upstox because token validity is more flexible",
  },
];

function StatusDot({ tone }: { tone: "live" | "simulated" | "warning" }) {
  const color =
    tone === "live" ? "var(--gain)" : tone === "warning" ? "var(--warn)" : "var(--text-tertiary)";
  return <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />;
}

function BrokerSettingsContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BrokerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"connect" | "connect-upstox" | "import" | null>(null);
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [smokeSummary, setSmokeSummary] = useState("");
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [tokenHealth, setTokenHealth] = useState<{
    connected: boolean;
    token_age_hours?: number | null;
    expires_at?: string | null;
    status?: "valid" | "expiring_soon" | "expired";
  } | null>(null);

  useEffect(() => {
    getKiteTokenHealth().then(setTokenHealth).catch(() => null);
    const interval = setInterval(() => {
      getKiteTokenHealth().then(setTokenHealth).catch(() => null);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      setState(await getBrokerStatus());
      setStatusError(null);
    } catch (e: unknown) {
      setState(null);
      setStatusError(accountDataErrorMessage(e, "Broker status is temporarily unavailable. Existing broker access is not being treated as disconnected."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (searchParams.get("connected")) {
      loadStatus();
      setToast("Broker connected. Account reads and filled-trade import are available. Place orders in your broker terminal; AlphaVyuh keeps the review workflow read-only.");
    }
  }, [searchParams]);

  const mode = useMemo(() => {
    if (statusError) return "status-unavailable" as const;
    if (!state?.has_api_key) return "platform-unavailable" as const;
    if (state.token_expired) return "token-expired" as const;
    if (state.connected || state.status === "connected_read_only") return "read-only" as const;
    return "simulated" as const;
  }, [state, statusError]);

  async function handleConnect() {
    if (statusError) {
      setError("Broker status is unavailable. Retry status before starting a broker connection.");
      return;
    }
    if (!state?.plan_allows_broker) {
      setError("Broker integration requires Pro or Elite. Upgrade in Billing to connect Zerodha or Upstox.");
      return;
    }
    setBusy("connect");
    setError("");
    try {
      const url = await getZerodhaLoginUrl();
      window.location.href = url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start Zerodha login");
      setBusy(null);
    }
  }

  async function handleAdapterConnect(broker: "upstox") {
    if (statusError) {
      setError("Broker status is unavailable. Retry status before starting a broker connection.");
      return;
    }
    if (!state?.plan_allows_broker) {
      setError("Broker integration requires Pro or Elite. Upgrade in Billing to connect Zerodha or Upstox.");
      return;
    }
    setBusy(`connect-${broker}`);
    setError("");
    try {
      const { auth_url } = await startBrokerConnect(broker);
      window.location.href = auth_url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Could not start ${broker} login`);
      setBusy(null);
    }
  }

  async function handleImport() {
    if (statusError) {
      setError("Broker status is unavailable. Retry status before importing filled trades.");
      return;
    }
    setBusy("import");
    setError("");
    try {
      const broker = state?.broker === "upstox" ? "upstox" : "zerodha";
      const result = await importBrokerTrades(broker);
      setToast(result.message);
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSmoke() {
    setSmokeBusy(true);
    setError("");
    setSmokeSummary("");
    try {
      const broker = state?.broker === "upstox" ? "upstox" : "zerodha";
      const result = await runBrokerReadOnlySmoke(broker);
      const checks = Object.entries(result.checks);
      const passed = checks.filter(([, check]) => check.ok).length;
      const failed = checks.length - passed;
      setSmokeSummary(`${passed}/${checks.length} ${activeBrokerLabel} read-only checks passed${failed ? `; ${failed} need attention` : ""}. No order route was called.`);
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Read-only broker smoke failed");
    } finally {
      setSmokeBusy(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg)",
  };

  const readOnlySmokeRequired = state?.read_only_smoke_required !== false;
  const readOnlySmokePassed = state?.read_only_smoke_passed === true;
  const readOnlySmokeStale = Boolean(state?.read_only_smoke_checked_at && state?.read_only_smoke_fresh === false);
  const liveOrderEnabled = state?.live_order_enabled === true;
  const smokeGateStatus = statusError
    ? "Unknown"
    : readOnlySmokeRequired
      ? readOnlySmokeStale
        ? "Smoke stale"
        : readOnlySmokePassed
          ? "Smoke passed"
          : "Smoke required"
      : "Not required";
  const smokeGateCopy = statusError
    ? "Broker safety state could not be confirmed. Order routes stay unavailable until status recovers."
    : liveOrderEnabled
      ? "Broker order routes report enabled. Keep broker confirmation on for every future order intent."
      : readOnlySmokeStale
        ? "Read-only broker smoke is older than the 24-hour launch gate. Rerun smoke before any future sandbox or live order route can be enabled."
        : readOnlySmokeRequired && !readOnlySmokePassed
          ? "Read-only broker smoke must pass before any future sandbox or live order route can be enabled."
          : "Read-only broker smoke has passed; order submission still stays disabled until owner approval.";
  const smokeChecklist = useMemo(() => brokerReadOnlyChecklist(state), [state]);
  const evidenceSummary = useMemo(() => brokerReadOnlyEvidenceSummary(state, { unavailable: Boolean(statusError) }), [state, statusError]);
  const smokeCheckedAt = state?.read_only_smoke_checked_at
    ? new Date(state.read_only_smoke_checked_at).toLocaleString()
    : null;

  const healthCards = [
    { label: "Broker app", value: statusError ? "Unknown" : state?.has_api_key ? "Configured" : "Unavailable", icon: ServerCog },
    { label: "Session", value: statusError ? "Unknown" : state?.connected ? "Read-only" : state?.has_token ? "Reconnect" : "Not connected", icon: PlugZap },
    { label: "Expiry", value: statusError ? "Unknown" : state?.token_expires_at ? new Date(state.token_expires_at).toLocaleString() : "No token", icon: Clock3 },
    { label: "Order gate", value: smokeGateStatus, icon: ShieldCheck },
  ];
  const lastSyncedLabel = statusError ? "Unknown" : state?.last_synced_at ? new Date(state.last_synced_at).toLocaleString() : "Never synced";
  const activeBrokerLabel = state?.broker === "upstox" ? "Upstox" : "Zerodha";
  const importBrokerLabel = statusError ? "broker" : state?.broker === "upstox" ? "Upstox" : "Zerodha";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-[1040px] mx-auto px-5 py-8">
        <div className="flex items-center gap-2 text-[12px] mb-6" style={{ color: "var(--text-tertiary)" }}>
          <Link href="/settings" className="hover:opacity-80" style={{ color: "var(--text-secondary)" }}>Settings</Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Broker connect</span>
        </div>

        <div style={{ marginBottom: 18 }}>
          <EyebrowLabel>Broker integration</EyebrowLabel>
          <div className="app-page-title" style={{ marginTop: 4 }}>Broker connect hub</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)", maxWidth: 720 }}>
            Connect one broker at a time for account checks and filled-trade import. Tokens stay encrypted on the backend. Broker execution stays in your broker terminal.
          </div>
        </div>

        {tokenHealth?.status === "expiring_soon" && (
          <div style={{ background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: 6, padding: "8px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock3 size={16} style={{ color: "var(--warn)" }} />
            <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>Token expires in less than 2 hours — reconnect to stay live</span>
          </div>
        )}

        {tokenHealth?.status === "expired" && (
          <div style={{ background: "rgba(225,85,96,0.12)", border: "1px solid rgba(225,85,96,0.3)", borderRadius: 6, padding: "8px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock3 size={16} style={{ color: "var(--loss)" }} />
            <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>Token expired — reconnect to restore live data</span>
          </div>
        )}

        {statusError && (
          <div
            data-testid="broker-status-unavailable"
            style={{ ...cardStyle, padding: 16, marginBottom: 14, borderColor: "rgba(217,119,6,0.28)", background: "rgba(217,119,6,0.08)" }}
          >
            <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--warn)", marginBottom: 7 }}>Broker status unavailable</div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>Broker account state could not be verified.</div>
            <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
              {statusError} Existing broker connection, plan, and import access are not being treated as disconnected or unavailable.
            </div>
            <button type="button" onClick={() => { setError(""); void loadStatus(); }} className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold inline-flex" style={{ background: "var(--accent)", color: "var(--bg-primary)" }}>
              Retry status
            </button>
          </div>
        )}

        {!statusError && !state?.plan_allows_broker && (
          <div style={{ ...cardStyle, padding: 16, marginBottom: 14, borderColor: "rgba(217,119,6,0.28)", background: "rgba(217,119,6,0.08)" }}>
            <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--warn)", marginBottom: 7 }}>Upgrade required</div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>Broker integration is available on Pro and Elite.</div>
            <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
              Free accounts can use scanner, watchlist, chart planning, and journaling. Broker OAuth and filled-trade import unlock after upgrade; execution stays in your broker terminal.
            </div>
            <Link href="/settings/billing" className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold inline-flex" style={{ background: "var(--accent)", color: "var(--bg-primary)" }}>
              View Pro plan
            </Link>
          </div>
        )}

        <div style={{ ...cardStyle, padding: 16, marginBottom: 14, borderColor: "rgba(244,247,251,0.16)" }}>
          <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>Broker adapter path</div>
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>
            Zerodha OAuth is active for profile, holdings, orderbook, and filled-trade import. Upstox uses the same OAuth adapter contract for connect, profile, holdings, and import where broker data is available.
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
            This keeps AlphaVyuh financially lean: no TradingView broker terminal dependency, no password handling, and every imported trade or journal capture can still create a draft before review after close.
          </div>
          <div className="text-[12px] mt-3" style={{ color: "var(--warn)", lineHeight: 1.65 }}>
            Live and sandbox order submission are not enabled yet; broker connections stay read-only/import only while trade plans remain journal captures.
          </div>
        </div>

        <div className="broker-settings-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)", gap: 14, alignItems: "start" }}>
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
              <div>
                <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>Current mode</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <StatusDot tone={mode === "read-only" ? "live" : mode === "token-expired" || mode === "status-unavailable" ? "warning" : "simulated"} />
                  <div
                    data-testid={mode === "read-only" ? "broker-status-connected" : mode === "status-unavailable" ? "broker-status-unavailable-inline" : "broker-status-simulated"}
                    className="text-[16px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {mode === "read-only"
                      ? `${activeBrokerLabel} connected`
                      : mode === "status-unavailable"
                        ? "Broker status unavailable"
                      : mode === "token-expired"
                        ? "Token expired"
                        : mode === "platform-unavailable"
                          ? "Connect unavailable"
                          : "Journal capture mode"}
                  </div>
                </div>
                <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {mode === "read-only"
                    ? "Profile, holdings, positions, orderbook, and filled-trade import are available. Order placement remains in your broker terminal."
                    : mode === "status-unavailable"
                      ? "Broker account state could not be confirmed. Recheck status before connecting, reconnecting, importing, or changing broker setup."
                      : mode === "token-expired"
                        ? "Your broker session expired. Reconnect through the broker security flow."
                      : mode === "platform-unavailable"
                        ? "AlphaVyuh's broker app is not configured in production yet. Traders do not need to enter API keys."
                        : "Order capture remains journal-only and journaling still works until a read-only broker session is connected."}
                </div>
              </div>
              <Num style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                {statusError ? "Status unavailable" : state?.plan_allows_broker ? (state?.connected_at ? `Connected ${new Date(state.connected_at).toLocaleDateString()}` : lastSyncedLabel) : "Upgrade required"}
              </Num>
            </div>

            <div className="broker-health-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
              {healthCards.map(({ label, value, icon: Icon }) => (
                <div key={label} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-tertiary)", marginBottom: 5 }}>
                    <Icon size={13} />
                    <div className="text-[11px]">{label}</div>
                  </div>
                  <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{value}</div>
                </div>
              ))}
            </div>

            <div
              data-testid="broker-read-only-smoke-gate"
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: readOnlySmokePassed ? "rgba(18,185,129,0.08)" : "rgba(217,119,6,0.08)",
                border: `1px solid ${readOnlySmokePassed ? "rgba(18,185,129,0.28)" : "rgba(217,119,6,0.28)"}`,
              }}
            >
              <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: readOnlySmokePassed ? "var(--gain)" : "var(--warn)", marginBottom: 4 }}>
                Read-only smoke gate: {smokeGateStatus}
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {smokeGateCopy} Live and sandbox orders are {liveOrderEnabled ? "still confirmation-gated" : "disabled"}.
              </div>
            </div>

            <div
              data-testid="broker-read-only-checklist"
              style={{ marginBottom: 14, padding: "12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Read-only readiness checklist</div>
                  <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {smokeCheckedAt ? `Last checked ${smokeCheckedAt}` : "Run smoke to verify profile, holdings, positions, orderbook, and trade import reads."}
                  </div>
                </div>
                <span className="workspace-pill" style={{ color: readOnlySmokePassed ? "var(--gain)" : "var(--warn)" }}>
                  {readOnlySmokeStale ? "Refresh required" : readOnlySmokePassed ? "Read-only verified" : "Pending verification"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {smokeChecklist.map((item) => (
                  <div key={item.id} style={{ padding: "9px 10px", borderRadius: "var(--radius-sm)", background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</div>
                      <span className="text-[11px] font-semibold" style={{ color: item.tone === "good" ? "var(--gain)" : item.tone === "warn" ? "var(--warn)" : "var(--text-tertiary)" }}>
                        {item.value}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--text-secondary)", lineHeight: 1.45 }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div
              data-testid="broker-read-only-evidence-pack"
              style={{
                marginBottom: 14,
                padding: "12px",
                borderRadius: "var(--radius-md)",
                background: evidenceSummary.status === "ready-for-owner-review" ? "rgba(18,185,129,0.08)" : "rgba(244,247,251,0.04)",
                border: `1px solid ${evidenceSummary.status === "ready-for-owner-review" ? "rgba(18,185,129,0.28)" : "var(--border-subtle)"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Read-only evidence pack</div>
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{evidenceSummary.headline}</div>
                </div>
                <span
                  className="workspace-pill"
                  style={{ color: evidenceSummary.canProceedToOwnerReview ? "var(--gain)" : evidenceSummary.status === "unavailable" ? "var(--loss)" : "var(--warn)" }}
                >
                  {evidenceSummary.canProceedToOwnerReview ? "Owner review ready" : evidenceSummary.status === "refresh-required" ? "Refresh required" : "Blocked"}
                </span>
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 10 }}>
                {evidenceSummary.detail}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 8, marginBottom: evidenceSummary.blockers.length ? 10 : 0 }}>
                {evidenceSummary.evidenceItems.map((item) => (
                  <div key={item.label} className="rounded-[8px] px-2.5 py-2" style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-[11px]" style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>{item.label}</div>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{item.value}</div>
                  </div>
                ))}
              </div>
              {evidenceSummary.blockers.length > 0 && (
                <div style={{ display: "grid", gap: 5 }}>
                  {evidenceSummary.blockers.slice(0, 4).map((blocker) => (
                    <div key={blocker} className="text-[12px]" style={{ color: "var(--warn)", lineHeight: 1.45 }}>
                      <CheckCircle2 size={12} style={{ display: "inline", marginRight: 7, color: "var(--warn)" }} />
                      {blocker}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Broker sync</div>
                <div className="text-[13px]" style={{ color: statusError ? "var(--warn)" : "var(--text-primary)" }}>{statusError ? "Broker status unavailable" : state?.status_label ?? "Simulated fallback active"}</div>
              </div>
              <Num style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Last sync: {lastSyncedLabel}
              </Num>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                data-testid="connect-btn"
                onClick={handleConnect}
                disabled={busy === "connect" || Boolean(statusError) || !state?.has_api_key || !state?.plan_allows_broker}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
              >
                {busy === "connect" ? "Opening Kite..." : mode === "read-only" ? "Reconnect Zerodha" : mode === "status-unavailable" ? "Status unavailable" : mode === "platform-unavailable" ? "Connect unavailable" : "Connect Zerodha"}
              </button>
              <button
                onClick={handleImport}
                disabled={busy === "import" || Boolean(statusError) || !state?.can_import || !state?.plan_allows_broker}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              >
                {busy === "import" ? "Importing..." : `Import ${importBrokerLabel} filled trades`}
              </button>
              <button
                onClick={handleSmoke}
                disabled={smokeBusy || Boolean(statusError) || !state?.has_api_key}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              >
                {smokeBusy ? "Checking..." : `Run ${activeBrokerLabel} read-only smoke`}
              </button>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <ShieldCheck size={17} style={{ color: "var(--accent)" }} />
              <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Production broker rules</div>
            </div>
            <div style={{ display: "grid", gap: 9 }}>
              {[
                "Secrets stay server-side and are written through the encrypted broker credential path.",
                "The frontend only asks for connection status and never receives broker tokens.",
                "Expired sessions fall back to journal capture mode instead of blocking chart/journal workflows.",
                "Broker order submission stays outside AlphaVyuh; filled broker trades can be imported into Journal.",
                "Broker passwords are never stored or requested; reconnect always happens through the broker security flow.",
                "Every imported trade or journal capture should still create a journal entry with source context.",
              ].map((line) => (
                <div key={line} className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {line}
                </div>
              ))}
            </div>
            <div
              data-testid="broker-execution-approval-record"
              style={{ marginTop: 14, padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid rgba(217,119,6,0.28)", background: "rgba(217,119,6,0.08)" }}
            >
              <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--warn)", marginBottom: 6 }}>Required before any future sandbox/live order test</div>
              <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 10 }}>
                Read-only smoke is evidence, not approval. A broker order test cannot run unless this owner-confirmed record exists.
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {BROKER_EXECUTION_APPROVAL_ITEMS.map((item) => (
                  <div key={item} className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <CheckCircle2 size={12} style={{ display: "inline", marginRight: 7, color: "var(--warn)" }} />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="broker-adapter-grid" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {BROKERS.map((broker) => {
            const active = broker.id === "zerodha";
            const upstoxConnectable = broker.id === "upstox";
            return (
              <div key={broker.id} style={{ ...cardStyle, padding: 18, opacity: active ? 1 : 0.78 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                  <div className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{broker.name}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: active ? "var(--gain)" : broker.status === "next" ? "var(--warn)" : "var(--text-tertiary)", padding: "3px 8px", borderRadius: 999, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                    {broker.status}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                  <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}><b>Auth:</b> {broker.auth}</div>
                  <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}><b>Session:</b> {broker.sessionPolicy}</div>
                  <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}><b>Scope:</b> {broker.scope}</div>
                </div>
                {active ? (
                  <button onClick={handleConnect} disabled={busy === "connect" || Boolean(statusError) || !state?.has_api_key || !state?.plan_allows_broker} className="w-full px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--bg-primary)" }}>
                    {statusError ? "Status unavailable" : state?.connected ? "Reconnect" : "Connect"}
                  </button>
                ) : upstoxConnectable ? (
                  <button onClick={() => handleAdapterConnect("upstox")} disabled={busy === "connect-upstox" || Boolean(statusError) || !state?.plan_allows_broker} className="w-full px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50" style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
                    {busy === "connect-upstox" ? "Opening Upstox..." : statusError ? "Status unavailable" : "Connect OAuth"}
                  </button>
                ) : (
                  <button disabled className="w-full px-4 py-2.5 rounded-[10px] text-[13px] font-semibold opacity-50" style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
                    Adapter pending
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ ...cardStyle, padding: 18, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <LockKeyhole size={16} style={{ color: "var(--accent)" }} />
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Rollout plan</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              "1. Stabilize Zerodha connect, reconnect, holdings, orderbook, and filled-trade import.",
              "2. Add a shared broker token status API so every adapter reports connected, expired, and permissions consistently.",
              "3. Add Upstox OAuth adapter next because its authorization-code flow maps cleanly to the current hub.",
              "4. Add Dhan after Upstox, using longer token validity for easier onboarding.",
            ].map((line) => (
              <div key={line} className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                <CheckCircle2 size={13} style={{ display: "inline", marginRight: 7, color: "var(--gain)" }} />
                {line}
              </div>
            ))}
          </div>
        </div>

        {(toast || error) && (
          <div style={{ ...cardStyle, padding: 14, marginTop: 14, color: error ? "var(--loss)" : "var(--text-primary)", background: error ? "rgba(255, 90, 101, 0.08)" : "var(--surface-1)" }}>
            <div className="text-[12px]">{error || toast}</div>
          </div>
        )}
        {smokeSummary && (
          <div style={{ ...cardStyle, padding: 14, marginTop: 14, color: "var(--text-primary)" }}>
            <div className="text-[12px]">{smokeSummary}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrokerSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    }>
      <BrokerSettingsContent />
    </Suspense>
  );
}
