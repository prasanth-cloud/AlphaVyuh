"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  startBrokerConnect,
  getBrokerProfile,
  getBrokerHoldings,
  disconnectBroker,
  type BrokerProfile,
  type BrokerHolding,
} from "@/lib/api";

function BrokerSettingsContent() {
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BrokerProfile | null>(null);
  const [holdings, setHoldings] = useState<BrokerHolding[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getBrokerProfile("zerodha")
      .then(p => { setProfile(p); return getBrokerHoldings("zerodha"); })
      .then(h => setHoldings(h))
      .catch(() => { setProfile(null); setHoldings([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (connectedParam) {
      getBrokerProfile("zerodha")
        .then(p => setProfile(p))
        .catch(() => {});
    }
  }, [connectedParam]);

  async function handleConnect() {
    setErr(""); setBusy(true);
    try {
      const { auth_url } = await startBrokerConnect("zerodha");
      window.location.href = auth_url;
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to start connection");
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setErr("");
    try {
      await disconnectBroker("zerodha");
      setProfile(null);
      setHoldings([]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--app-surface)",
    border: "1px solid var(--app-border)",
    borderRadius: "12px",
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#5b63f5", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-[580px] mx-auto px-5 py-8">

        <div className="flex items-center gap-2 text-[12px] mb-6" style={{ color: "var(--app-text3)" }}>
          <Link href="/settings" className="hover:opacity-80" style={{ color: "var(--app-text2)" }}>Settings</Link>
          <span>/</span>
          <span style={{ color: "var(--app-text1)", fontWeight: 500 }}>Broker connection</span>
        </div>

        <div className="mb-6">
          <div className="text-[20px] font-semibold" style={{ color: "var(--app-text1)" }}>Broker connection</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--app-text2)" }}>
            Connect Zerodha Kite to place orders directly from the chart.
          </div>
        </div>

        {profile ? (
          /* Connected state */
          <div style={cardStyle} className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full" style={{ background: "#26a65b" }} />
              <div>
                <div data-testid="broker-status-connected" className="text-[15px] font-semibold" style={{ color: "var(--app-text1)" }}>
                  Zerodha connected
                </div>
                <div className="text-[11px]" style={{ color: "var(--app-text3)" }}>
                  Logged in as {profile.display_name} ({profile.user_id})
                </div>
              </div>
            </div>

            {holdings.length > 0 && (
              <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.5px] mb-2" style={{ color: "#888" }}>
                  Holdings
                </div>
                <div className="space-y-1">
                  {holdings.map(h => (
                    <div key={h.symbol} className="flex items-center justify-between py-1.5 text-[13px]"
                      style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <span className="font-medium" style={{ color: "var(--app-text1)" }}>{h.symbol}</span>
                      <div className="flex items-center gap-4 text-[12px]">
                        <span style={{ color: "var(--app-text2)" }}>{h.quantity} shares</span>
                        <span style={{ color: h.pnl >= 0 ? "#26a65b" : "#e5383b" }}>
                          {h.pnl >= 0 ? "+" : ""}{h.pnl.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {err && <div className="text-[12px] mb-3" style={{ color: "#e5383b" }}>{err}</div>}

            <button
              data-testid="disconnect-btn"
              onClick={handleDisconnect}
              disabled={busy}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold disabled:opacity-50"
              style={{ border: "1px solid rgba(229,56,59,0.3)", color: "#e5383b", background: "transparent" }}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          /* Not connected state */
          <div style={cardStyle} className="p-6">
            <div data-testid="broker-status-disconnected" className="text-[14px] font-medium mb-2" style={{ color: "var(--app-text1)" }}>
              Connect your Zerodha account
            </div>
            <div className="text-[12px] mb-5" style={{ color: "var(--app-text2)" }}>
              Click below to open Kite Connect OAuth. You will be redirected back automatically after login.
            </div>

            <div className="space-y-2 mb-5 text-[12px]" style={{ color: "var(--app-text2)" }}>
              {["Place Market, Limit, SL orders from charts", "Auto-import filled trades into journal", "Real-time order status tracking"].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ background: "rgba(91,99,245,0.12)", color: "#5b63f5" }}>✓</div>
                  {f}
                </div>
              ))}
            </div>

            {err && <div className="text-[12px] mb-3" style={{ color: "#e5383b" }}>{err}</div>}

            <button
              data-testid="connect-btn"
              onClick={handleConnect}
              disabled={busy}
              className="w-full py-2.5 rounded-[8px] text-[13px] font-bold disabled:opacity-50 transition-opacity"
              style={{ background: "#5b63f5", color: "#fff" }}>
              {busy ? "Redirecting to Kite…" : "Connect Zerodha via Kite"}
            </button>
          </div>
        )}

        <div className="mt-3 p-4 opacity-50" style={cardStyle}>
          <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>More brokers — coming soon</div>
          <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>Upstox · Fyers · Angel One · ICICI Direct</div>
        </div>
      </div>
    </div>
  );
}

export default function BrokerSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#5b63f5", borderTopColor: "transparent" }} />
      </div>
    }>
      <BrokerSettingsContent />
    </Suspense>
  );
}
