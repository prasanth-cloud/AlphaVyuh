"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, KeyRound, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import {
  getBrokerStatus,
  getZerodhaLoginUrl,
  importBrokerTrades,
  runZerodhaReadOnlySmoke,
  startBrokerConnect,
} from "@/lib/api";
import { EyebrowLabel, Num } from "@/components/ui";

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
    scope: "Profile, holdings, positions, orderbook, tradebook, gated order routing, and filled-trade import",
  },
  {
    id: "upstox",
    name: "Upstox",
    status: "next",
    auth: "OAuth 2.0 authorization-code flow",
    sessionPolicy: "Standard session expires at 03:30 AM next day; extended read mode needs approval",
    scope: "OAuth, profile, holdings, gated order routing, and filled-trade import where broker data is available",
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
  const [toast, setToast] = useState("");

  async function loadStatus() {
    setLoading(true);
    try {
      setState(await getBrokerStatus());
    } catch {
      setState(null);
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
      setToast("Broker connected. Account reads and filled-trade import are available. Live orders require Pro/Elite, backend enablement, and explicit confirmation.");
    }
  }, [searchParams]);

  const mode = useMemo(() => {
    if (!state?.has_api_key) return "credentials-missing" as const;
    if (state.token_expired) return "token-expired" as const;
    if (state.connected || state.status === "connected_read_only") return "read-only" as const;
    return "simulated" as const;
  }, [state]);

  async function handleConnect() {
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
      const result = await runZerodhaReadOnlySmoke();
      const checks = Object.entries(result.checks);
      const passed = checks.filter(([, check]) => check.ok).length;
      const failed = checks.length - passed;
      setSmokeSummary(`${passed}/${checks.length} read-only checks passed${failed ? `; ${failed} need attention` : ""}. No order route was called.`);
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

  const healthCards = [
    { label: "Credentials", value: state?.has_api_key ? "Saved" : "Missing", icon: KeyRound },
    { label: "Session", value: state?.connected ? "Read-only" : state?.has_token ? "Reconnect" : "Not connected", icon: PlugZap },
    { label: "Expiry", value: state?.token_expires_at ? new Date(state.token_expires_at).toLocaleString() : "No token", icon: Clock3 },
  ];
  const lastSyncedLabel = state?.last_synced_at ? new Date(state.last_synced_at).toLocaleString() : "Never synced";
  const activeBrokerLabel = state?.broker === "upstox" ? "Upstox" : "Zerodha";

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
            Connect one broker at a time for account checks, filled-trade import, and gated order routing. Tokens stay encrypted on the backend. Live orders require Pro/Elite, backend enablement, and explicit confirmation.
          </div>
        </div>

        {!state?.plan_allows_broker && (
          <div style={{ ...cardStyle, padding: 16, marginBottom: 14, borderColor: "rgba(217,119,6,0.28)", background: "rgba(217,119,6,0.08)" }}>
            <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--warn)", marginBottom: 7 }}>Upgrade required</div>
            <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>Broker integration is available on Pro and Elite.</div>
            <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
              Free accounts can use scanner, watchlist, chart planning, and journaling. Broker OAuth, trade import, and gated order routing unlock after upgrade.
            </div>
            <Link href="/settings/billing" className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold inline-flex" style={{ background: "var(--accent)", color: "var(--bg-primary)" }}>
              View Pro plan
            </Link>
          </div>
        )}

        <div style={{ ...cardStyle, padding: 16, marginBottom: 14, borderColor: "rgba(244,247,251,0.16)" }}>
          <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>Broker adapter path</div>
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>
            Zerodha OAuth is active for profile, holdings, orderbook, filled-trade import, and gated order routing. Upstox uses the same OAuth adapter contract for connect, profile, holdings, order routing, and import where broker data is available.
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
            This keeps AlphaVyuh financially lean: no TradingView broker terminal dependency, no password handling, and every imported or simulated trade can still create a journal draft before review after close.
          </div>
        </div>

        <div className="broker-settings-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)", gap: 14, alignItems: "start" }}>
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
              <div>
                <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>Current mode</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <StatusDot tone={mode === "read-only" ? "live" : mode === "token-expired" ? "warning" : "simulated"} />
                  <div
                    data-testid={mode === "read-only" ? "broker-status-connected" : "broker-status-simulated"}
                    className="text-[16px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {mode === "read-only"
                      ? `${activeBrokerLabel} connected`
                      : mode === "token-expired"
                        ? "Token expired"
                        : mode === "credentials-missing"
                          ? "Credentials needed"
                          : "Simulated mode"}
                  </div>
                </div>
                <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {mode === "read-only"
                    ? "Profile, holdings, positions, orderbook, and filled-trade import are available. Live order routing stays gated by plan, backend enablement, and explicit confirmation."
                    : mode === "token-expired"
                      ? "Your API key is saved, but Kite needs a fresh daily access token."
                      : mode === "credentials-missing"
                        ? "Save the Zerodha API key and secret, then connect Kite from this hub."
                        : "Order capture remains simulated and journaling still works until a read-only broker session is connected."}
                </div>
              </div>
              <Num style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                {state?.plan_allows_broker ? (state?.connected_at ? `Connected ${new Date(state.connected_at).toLocaleDateString()}` : lastSyncedLabel) : "Upgrade required"}
              </Num>
            </div>

            <div className="broker-health-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
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

            <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>Broker sync</div>
                <div className="text-[13px]" style={{ color: "var(--text-primary)" }}>{state?.status_label ?? "Simulated fallback active"}</div>
              </div>
              <Num style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Last sync: {lastSyncedLabel}
              </Num>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                data-testid="connect-btn"
                onClick={handleConnect}
                disabled={busy === "connect" || !state?.has_api_key || !state?.plan_allows_broker}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
              >
                {busy === "connect" ? "Opening Kite..." : mode === "read-only" ? "Reconnect Zerodha" : "Connect Zerodha"}
              </button>
              <button
                onClick={handleImport}
                disabled={busy === "import" || !state?.can_import || !state?.plan_allows_broker}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              >
                {busy === "import" ? "Importing..." : `Import ${state?.broker === "upstox" ? "Upstox" : "Zerodha"} filled trades`}
              </button>
              <button
                onClick={handleSmoke}
                disabled={smokeBusy || !state?.has_api_key}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              >
                {smokeBusy ? "Checking..." : "Run read-only smoke"}
              </button>
              <Link href="/settings?tab=broker" className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
                Edit Zerodha keys
              </Link>
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
                "Expired sessions fall back to simulated mode instead of blocking chart/journal workflows.",
                "Live order submission requires Pro/Elite, backend enablement, and explicit user confirmation; filled broker trades can be imported into Journal.",
                "Broker passwords are never stored or requested; reconnect always happens through the broker security flow.",
                "Every imported or simulated trade should still create a journal entry with source context.",
              ].map((line) => (
                <div key={line} className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {line}
                </div>
              ))}
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
                  <button onClick={handleConnect} disabled={busy === "connect" || !state?.has_api_key || !state?.plan_allows_broker} className="w-full px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--bg-primary)" }}>
                    {state?.connected ? "Reconnect" : "Connect"}
                  </button>
                ) : upstoxConnectable ? (
                  <button onClick={() => handleAdapterConnect("upstox")} disabled={busy === "connect-upstox" || !state?.plan_allows_broker} className="w-full px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50" style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
                    {busy === "connect-upstox" ? "Opening Upstox..." : "Connect OAuth beta"}
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
              "4. Add Dhan after Upstox, using longer token validity for easier beta-user onboarding.",
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
