"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getBrokerStatus,
  updateMe,
  getZerodhaLoginUrl,
  connectZerodha,
} from "@/lib/api";

type Step = "credentials" | "login" | "token" | "connected";

const inputStyle: React.CSSProperties = {
  background: "var(--app-surface3)",
  border: "1px solid var(--app-border)",
  color: "var(--app-text1)",
};

export default function BrokerSettingsPage() {
  const [status, setStatus] = useState<{
    connected: boolean; broker: string | null; has_api_key: boolean; has_token: boolean; connected_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("credentials");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [requestToken, setRequestToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getBrokerStatus()
      .then(s => {
        setStatus(s);
        if (s.connected) setStep("connected");
        else if (s.has_api_key) setStep("login");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveCredentials() {
    if (!apiKey.trim() || !apiSecret.trim()) { setErr("API key and secret are required."); return; }
    setErr(""); setBusy(true);
    try {
      await updateMe({ broker_type: "zerodha", broker_api_key: apiKey.trim(), broker_api_secret: apiSecret.trim() });
      const url = await getZerodhaLoginUrl();
      setLoginUrl(url);
      setStep("login");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save credentials");
    } finally {
      setBusy(false);
    }
  }

  async function handleGetLoginUrl() {
    setErr(""); setBusy(true);
    try {
      const url = await getZerodhaLoginUrl();
      setLoginUrl(url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to get login URL — check your API key");
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    if (!requestToken.trim()) { setErr("Paste your request_token first."); return; }
    setErr(""); setBusy(true);
    try {
      await connectZerodha(requestToken.trim());
      setStep("connected");
      const s = await getBrokerStatus();
      setStatus(s);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Connection failed — check the request_token");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await updateMe({ broker_type: "", broker_api_key: "", broker_api_secret: "" });
      setStatus(s => s ? { ...s, connected: false, has_api_key: false, has_token: false } : s);
      setStep("credentials");
      setApiKey(""); setApiSecret(""); setLoginUrl(""); setRequestToken("");
    } catch {
      setErr("Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--app-teal)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--app-surface)",
    border: "1px solid var(--app-border)",
    borderRadius: "12px",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-[580px] mx-auto px-5 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] mb-6" style={{ color: "var(--app-text3)" }}>
          <Link href="/settings" className="transition-colors hover:opacity-80" style={{ color: "var(--app-text2)" }}>Settings</Link>
          <span>/</span>
          <span style={{ color: "var(--app-text1)", fontWeight: 500 }}>Broker connection</span>
        </div>

        <div className="mb-6">
          <div className="text-[20px] font-semibold" style={{ color: "var(--app-text1)" }}>Broker connection</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--app-text2)" }}>
            Connect Zerodha Kite to place orders directly from the chart.
          </div>
        </div>

        {/* ── Connected state ── */}
        {step === "connected" && status?.connected && (
          <div style={cardStyle} className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full" style={{ background: "var(--app-gain)" }} />
              <div>
                <div className="text-[15px] font-semibold capitalize" style={{ color: "var(--app-text1)" }}>
                  {status.broker ?? "Zerodha"} connected
                </div>
                {status.connected_at && (
                  <div className="text-[11px]" style={{ color: "var(--app-text3)" }}>
                    Since {new Date(status.connected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 mb-5 text-[12px]" style={{ color: "var(--app-text2)" }}>
              {["Place Market, Limit, SL orders from charts", "Auto-import filled trades into journal", "Real-time order status tracking"].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{ background: "rgba(38,166,91,0.15)", color: "var(--app-gain)" }}>✓</div>
                  {f}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setStep("credentials"); setApiKey(""); setApiSecret(""); }}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-colors"
                style={{ border: "1px solid var(--app-border)", color: "var(--app-text2)", background: "transparent" }}>
                Reconnect
              </button>
              <button onClick={handleDisconnect} disabled={busy}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold disabled:opacity-50"
                style={{ border: "1px solid rgba(229,56,59,0.3)", color: "var(--app-loss)", background: "transparent" }}>
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ── Setup flow ── */}
        {step !== "connected" && (
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            {/* Step indicator */}
            <div className="flex" style={{ borderBottom: "1px solid var(--app-border)" }}>
              {(["credentials", "login", "token"] as Step[]).map((s, i) => {
                const stepIndex = (["credentials","login","token"] as Step[]).indexOf(step);
                const isDone = stepIndex > i;
                const isCurrent = step === s;
                return (
                  <div key={s} className="flex-1 px-4 py-3 text-center text-[11px] font-semibold"
                    style={{
                      color: isCurrent ? "var(--app-teal)" : isDone ? "var(--app-gain)" : "var(--app-text3)",
                      borderBottom: isCurrent ? "2px solid var(--app-teal)" : "2px solid transparent",
                    }}>
                    {i + 1}. {s === "credentials" ? "API Keys" : s === "login" ? "Login" : "Connect"}
                  </div>
                );
              })}
            </div>

            <div className="p-6">
              {/* Step 1: API credentials */}
              {step === "credentials" && (
                <div>
                  <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Enter your Zerodha API credentials</div>
                  <div className="text-[12px] mb-4" style={{ color: "var(--app-text2)" }}>
                    Get these from{" "}
                    <a href="https://developers.kite.trade" target="_blank" rel="noreferrer" style={{ color: "var(--app-teal)" }} className="hover:underline">
                      developers.kite.trade
                    </a>
                    {" "}→ Your apps → API key / API secret.
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.4px]" style={{ color: "var(--app-text3)" }}>API Key</label>
                      <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="e.g. kitecfr8l2xxxxxx"
                        className="mt-1 w-full text-[13px] rounded-[7px] px-3 py-2.5 outline-none" style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.4px]" style={{ color: "var(--app-text3)" }}>API Secret</label>
                      <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Your API secret"
                        className="mt-1 w-full text-[13px] rounded-[7px] px-3 py-2.5 outline-none" style={inputStyle} />
                    </div>
                  </div>
                  {err && <div className="text-[12px] mb-3" style={{ color: "var(--app-loss)" }}>{err}</div>}
                  <button onClick={handleSaveCredentials} disabled={busy || !apiKey.trim() || !apiSecret.trim()}
                    className="w-full py-2.5 rounded-[8px] text-[13px] font-bold disabled:opacity-50 transition-opacity"
                    style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
                    {busy ? "Saving…" : "Save & continue →"}
                  </button>
                </div>
              )}

              {/* Step 2: Login via Kite */}
              {step === "login" && (
                <div>
                  <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Log in to Zerodha Kite</div>
                  <div className="text-[12px] mb-4" style={{ color: "var(--app-text2)" }}>
                    Click the button below to open Kite login in a new tab. After logging in, you&apos;ll be
                    redirected to a URL containing <code className="px-1 rounded text-[11px]"
                      style={{ background: "var(--app-surface3)", color: "var(--app-text1)" }}>request_token=...</code>.
                    Copy that token and paste it in the next step.
                  </div>
                  {loginUrl ? (
                    <a href={loginUrl} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[8px] text-[13px] font-bold transition-opacity mb-3"
                      style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
                      Open Kite login →
                    </a>
                  ) : (
                    <button onClick={handleGetLoginUrl} disabled={busy}
                      className="w-full py-2.5 rounded-[8px] text-[13px] font-bold disabled:opacity-50 transition-opacity mb-3"
                      style={{ background: "var(--app-teal)", color: "#0D0F14" }}>
                      {busy ? "Loading…" : "Get login URL"}
                    </button>
                  )}
                  {err && <div className="text-[12px] mb-3" style={{ color: "var(--app-loss)" }}>{err}</div>}
                  <button onClick={() => setStep("token")}
                    className="w-full py-2 rounded-[8px] text-[12px] font-semibold transition-colors"
                    style={{ border: "1px solid var(--app-border)", color: "var(--app-text2)", background: "transparent" }}>
                    I&apos;ve logged in — paste my request_token →
                  </button>
                  <button onClick={() => setStep("credentials")} className="mt-3 text-[11px]"
                    style={{ color: "var(--app-text3)" }}>
                    ← Change API credentials
                  </button>
                </div>
              )}

              {/* Step 3: Paste request_token */}
              {step === "token" && (
                <div>
                  <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>Paste your request_token</div>
                  <div className="text-[12px] mb-4" style={{ color: "var(--app-text2)" }}>
                    After Kite login, you were redirected to a URL like:<br />
                    <code className="text-[10px] px-2 py-0.5 rounded block mt-1 break-all"
                      style={{ background: "var(--app-surface3)", color: "var(--app-text2)" }}>
                      https://127.0.0.1/?request_token=<span style={{ color: "var(--app-teal)" }}>AbCdEfGhIjKlMnOp</span>&amp;action=login&amp;status=success
                    </code>
                    Copy the value after <code className="px-1 rounded" style={{ background: "var(--app-surface3)", color: "var(--app-text1)" }}>request_token=</code> and paste below.
                  </div>
                  <input value={requestToken} onChange={e => setRequestToken(e.target.value)}
                    placeholder="Paste request_token here…"
                    className="w-full text-[13px] rounded-[7px] px-3 py-2.5 outline-none mb-3 font-mono"
                    style={inputStyle} />
                  {err && <div className="text-[12px] mb-3" style={{ color: "var(--app-loss)" }}>{err}</div>}
                  <button onClick={handleConnect} disabled={busy || !requestToken.trim()}
                    className="w-full py-2.5 rounded-[8px] text-[13px] font-bold disabled:opacity-50 transition-opacity mb-2"
                    style={{ background: "var(--app-gain)", color: "#fff" }}>
                    {busy ? "Connecting…" : "Connect Zerodha"}
                  </button>
                  <button onClick={() => setStep("login")} className="mt-1 text-[11px]"
                    style={{ color: "var(--app-text3)" }}>
                    ← Back to login step
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coming soon */}
        {step !== "connected" && (
          <div className="mt-3 p-4 opacity-50" style={cardStyle}>
            <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--app-text1)" }}>More brokers — coming soon</div>
            <div className="text-[12px]" style={{ color: "var(--app-text3)" }}>Upstox · Fyers · Angel One · ICICI Direct</div>
          </div>
        )}
      </div>
    </div>
  );
}
