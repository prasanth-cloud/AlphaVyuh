"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, KeyRound, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import {
  getBrokerStatus,
  getZerodhaLoginUrl,
  importZerodhaTrades,
} from "@/lib/api";

type BrokerState = Awaited<ReturnType<typeof getBrokerStatus>>;
type BrokerCard = {
  id: "zerodha" | "upstox" | "dhan";
  name: string;
  status: "active" | "next" | "planned";
  auth: string;
  token: string;
  scope: string;
};

const BROKERS: BrokerCard[] = [
  {
    id: "zerodha",
    name: "Zerodha Kite",
    status: "active",
    auth: "Kite Connect request-token flow",
    token: "Daily token, expires around 06:00 IST",
    scope: "Profile, holdings, orders, filled-trade import, chart-backed execution",
  },
  {
    id: "upstox",
    name: "Upstox",
    status: "next",
    auth: "OAuth 2.0 authorization-code flow",
    token: "Standard token expires at 03:30 AM next day; extended read token available by approval",
    scope: "Holdings, positions, order book, execution after adapter is added",
  },
  {
    id: "dhan",
    name: "Dhan",
    status: "planned",
    auth: "Access-token flow, partner path for multi-user platforms",
    token: "User-controlled validity from 8 hours to 30 days",
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
  const [busy, setBusy] = useState<"connect" | "import" | null>(null);
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
      setToast("Zerodha connected. Live execution and trade import are enabled while the token is valid.");
    }
  }, [searchParams]);

  const mode = useMemo(() => {
    if (!state?.has_api_key) return "credentials-missing" as const;
    if (state.connected) return "live" as const;
    if (state.token_expired) return "token-expired" as const;
    return "simulated" as const;
  }, [state]);

  async function handleConnect() {
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

  async function handleImport() {
    setBusy("import");
    setError("");
    try {
      const result = await importZerodhaTrades();
      setToast(result.message);
      await loadStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg)",
  };

  const healthCards = [
    { label: "Credentials", value: state?.has_api_key ? "Saved" : "Missing", icon: KeyRound },
    { label: "Session", value: state?.connected ? "Live" : state?.has_token ? "Reconnect" : "Not connected", icon: PlugZap },
    { label: "Expiry", value: state?.token_expires_at ? new Date(state.token_expires_at).toLocaleString() : "No token", icon: Clock3 },
  ];

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
          <div className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>Broker Connect Hub</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)", maxWidth: 720 }}>
            Connect one broker at a time, keep tokens encrypted on the backend, and route chart/watchlist orders through the active adapter. Zerodha is the beta adapter first; Upstox and Dhan are staged as the next adapters after small-group verification.
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 16, marginBottom: 14, borderColor: "rgba(244,247,251,0.16)" }}>
          <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>Broker adapter path</div>
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 6 }}>
            Zerodha OAuth is active first. Simulated fallback remains available. Upstox uses the same adapter contract later.
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
            This keeps AlphaVyuh financially lean: no TradingView broker terminal dependency, no password handling, and every order can still auto-create a journal draft before AI review after close.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 0.95fr)", gap: 14, alignItems: "start" }}>
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
              <div>
                <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>Current mode</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <StatusDot tone={mode === "live" ? "live" : mode === "token-expired" ? "warning" : "simulated"} />
                  <div
                    data-testid={mode === "live" ? "broker-status-connected" : "broker-status-simulated"}
                    className="text-[16px] font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {mode === "live"
                      ? "Live via Zerodha"
                      : mode === "token-expired"
                        ? "Token expired"
                        : mode === "credentials-missing"
                          ? "Credentials needed"
                          : "Simulated mode"}
                  </div>
                </div>
                <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {mode === "live"
                    ? "Orders from charts and watchlists route to Zerodha, then AlphaVyuh records them in the journal."
                    : mode === "token-expired"
                      ? "Your API key is saved, but Kite needs a fresh daily access token."
                      : mode === "credentials-missing"
                        ? "Save the Zerodha API key and secret, then connect Kite from this hub."
                        : "Orders remain simulated and journaling still works until a broker session is connected."}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                {state?.connected_at ? `Connected ${new Date(state.connected_at).toLocaleDateString()}` : "No live session"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                data-testid="connect-btn"
                onClick={handleConnect}
                disabled={busy === "connect" || !state?.has_api_key}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
              >
                {busy === "connect" ? "Opening Kite..." : mode === "live" ? "Reconnect Zerodha" : "Connect Zerodha"}
              </button>
              <button
                onClick={handleImport}
                disabled={busy === "import" || !state?.connected}
                className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
              >
                {busy === "import" ? "Importing..." : "Import today's filled trades"}
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
                "Live order submission requires an explicit final confirmation of symbol, side, quantity, price, and risk.",
                "Broker passwords are never stored or requested; reconnect always happens through the broker security flow.",
                "Every live order should still create a journal entry with broker context.",
              ].map((line) => (
                <div key={line} className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
          {BROKERS.map((broker) => {
            const active = broker.id === "zerodha";
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
                  <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}><b>Token:</b> {broker.token}</div>
                  <div className="text-[12px]" style={{ color: "var(--text-secondary)", lineHeight: 1.55 }}><b>Scope:</b> {broker.scope}</div>
                </div>
                {active ? (
                  <button onClick={handleConnect} disabled={busy === "connect" || !state?.has_api_key} className="w-full px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--bg-primary)" }}>
                    {state?.connected ? "Reconnect" : "Connect"}
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
              "1. Stabilize Zerodha connect, reconnect, holdings, import, and chart/watchlist order flow.",
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
