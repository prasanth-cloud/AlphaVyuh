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

export default function BrokerSettingsPage() {
  const [status, setStatus] = useState<{
    connected: boolean; broker: string | null; has_api_key: boolean; has_token: boolean; connected_at: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
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
      <div className="min-h-screen bg-[#f2f2f0] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      <div className="max-w-[580px] mx-auto px-5 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] text-[#aaa] mb-6">
          <Link href="/settings" className="hover:text-[#1c1c1a] transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-[#1c1c1a] font-medium">Broker connection</span>
        </div>

        <div className="mb-6">
          <div className="text-[20px] font-semibold text-[#1c1c1a]">Broker connection</div>
          <div className="text-[13px] text-[#888] mt-1">
            Connect Zerodha Kite to place orders directly from the chart.
          </div>
        </div>

        {/* ── Connected state ── */}
        {step === "connected" && status?.connected && (
          <div className="bg-white border border-[#e2e2df] rounded-[10px] p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-3 h-3 rounded-full bg-[#26a65b]" />
              <div>
                <div className="text-[15px] font-semibold text-[#1c1c1a] capitalize">
                  {status.broker ?? "Zerodha"} connected
                </div>
                {status.connected_at && (
                  <div className="text-[11px] text-[#888]">
                    Since {new Date(status.connected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 mb-5 text-[12px] text-[#555]">
              {["Place Market, Limit, SL orders from charts", "Auto-import filled trades into journal", "Real-time order status tracking"].map(f => (
                <div key={f} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#edfaf3] flex items-center justify-center text-[#26a65b] text-[9px] font-bold flex-shrink-0">✓</div>
                  {f}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setStep("credentials"); setApiKey(""); setApiSecret(""); }}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold border border-[#e2e2df] text-[#555] hover:bg-[#f7f7f5]"
              >
                Reconnect
              </button>
              <button
                onClick={handleDisconnect}
                disabled={busy}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-[#e5383b] hover:bg-[#fff0f0] border border-[#e5383b33] disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ── Setup flow ── */}
        {step !== "connected" && (
          <div className="bg-white border border-[#e2e2df] rounded-[10px] overflow-hidden">

            {/* Step indicator */}
            <div className="flex border-b border-[#f0f0ee]">
              {(["credentials", "login", "token"] as Step[]).map((s, i) => (
                <div
                  key={s}
                  className={`flex-1 px-4 py-3 text-center text-[11px] font-semibold ${
                    step === s ? "text-[#5b63f5] border-b-2 border-[#5b63f5]" :
                    (["credentials","login","token"] as Step[]).indexOf(step) > i ? "text-[#26a65b]" : "text-[#bbb]"
                  }`}
                >
                  {i + 1}. {s === "credentials" ? "API Keys" : s === "login" ? "Login" : "Connect"}
                </div>
              ))}
            </div>

            <div className="p-6">
              {/* Step 1: API credentials */}
              {step === "credentials" && (
                <div>
                  <div className="text-[13px] font-semibold text-[#1c1c1a] mb-1">Enter your Zerodha API credentials</div>
                  <div className="text-[12px] text-[#888] mb-4">
                    Get these from{" "}
                    <a href="https://developers.kite.trade" target="_blank" rel="noreferrer" className="text-[#5b63f5] hover:underline">
                      developers.kite.trade
                    </a>
                    {" "}→ Your apps → API key / API secret.
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.4px]">API Key</label>
                      <input
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="e.g. kitecfr8l2xxxxxx"
                        className="mt-1 w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-3 py-2.5 outline-none focus:border-[#5b63f5]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.4px]">API Secret</label>
                      <input
                        type="password"
                        value={apiSecret}
                        onChange={e => setApiSecret(e.target.value)}
                        placeholder="Your API secret"
                        className="mt-1 w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-3 py-2.5 outline-none focus:border-[#5b63f5]"
                      />
                    </div>
                  </div>
                  {err && <div className="text-[12px] text-[#e5383b] mb-3">{err}</div>}
                  <button
                    onClick={handleSaveCredentials}
                    disabled={busy || !apiKey.trim() || !apiSecret.trim()}
                    className="w-full py-2.5 rounded-[8px] text-[13px] font-bold text-white bg-[#5b63f5] hover:opacity-85 disabled:opacity-50 transition-opacity"
                  >
                    {busy ? "Saving…" : "Save & continue →"}
                  </button>
                </div>
              )}

              {/* Step 2: Login via Kite */}
              {step === "login" && (
                <div>
                  <div className="text-[13px] font-semibold text-[#1c1c1a] mb-1">Log in to Zerodha Kite</div>
                  <div className="text-[12px] text-[#888] mb-4">
                    Click the button below to open Kite login in a new tab. After logging in, you&apos;ll be
                    redirected to a URL containing <code className="bg-[#f2f2f0] px-1 rounded text-[11px]">request_token=...</code>.
                    Copy that token and paste it in the next step.
                  </div>

                  {loginUrl ? (
                    <a
                      href={loginUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[8px] text-[13px] font-bold text-white bg-[#5b63f5] hover:opacity-85 transition-opacity mb-3"
                    >
                      Open Kite login →
                    </a>
                  ) : (
                    <button
                      onClick={handleGetLoginUrl}
                      disabled={busy}
                      className="w-full py-2.5 rounded-[8px] text-[13px] font-bold text-white bg-[#5b63f5] hover:opacity-85 disabled:opacity-50 transition-opacity mb-3"
                    >
                      {busy ? "Loading…" : "Get login URL"}
                    </button>
                  )}

                  {err && <div className="text-[12px] text-[#e5383b] mb-3">{err}</div>}

                  <button
                    onClick={() => setStep("token")}
                    className="w-full py-2 rounded-[8px] text-[12px] font-semibold border border-[#e2e2df] text-[#555] hover:bg-[#f7f7f5]"
                  >
                    I&apos;ve logged in — paste my request_token →
                  </button>

                  <button onClick={() => setStep("credentials")} className="mt-3 text-[11px] text-[#aaa] hover:text-[#555]">
                    ← Change API credentials
                  </button>
                </div>
              )}

              {/* Step 3: Paste request_token */}
              {step === "token" && (
                <div>
                  <div className="text-[13px] font-semibold text-[#1c1c1a] mb-1">Paste your request_token</div>
                  <div className="text-[12px] text-[#888] mb-4">
                    After Kite login, you were redirected to a URL like:<br />
                    <code className="text-[10px] bg-[#f2f2f0] px-2 py-0.5 rounded block mt-1 break-all">
                      https://127.0.0.1/?request_token=<span className="text-[#5b63f5]">AbCdEfGhIjKlMnOp</span>&amp;action=login&amp;status=success
                    </code>
                    Copy the value after <code className="bg-[#f2f2f0] px-1 rounded">request_token=</code> and paste below.
                  </div>
                  <input
                    value={requestToken}
                    onChange={e => setRequestToken(e.target.value)}
                    placeholder="Paste request_token here…"
                    className="w-full text-[13px] border border-[#e2e2df] rounded-[7px] px-3 py-2.5 outline-none focus:border-[#5b63f5] mb-3 font-mono"
                  />
                  {err && <div className="text-[12px] text-[#e5383b] mb-3">{err}</div>}
                  <button
                    onClick={handleConnect}
                    disabled={busy || !requestToken.trim()}
                    className="w-full py-2.5 rounded-[8px] text-[13px] font-bold text-white bg-[#26a65b] hover:opacity-85 disabled:opacity-50 transition-opacity mb-2"
                  >
                    {busy ? "Connecting…" : "Connect Zerodha"}
                  </button>
                  <button onClick={() => setStep("login")} className="mt-1 text-[11px] text-[#aaa] hover:text-[#555]">
                    ← Back to login step
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coming soon */}
        {step !== "connected" && (
          <div className="mt-3 bg-white border border-[#e2e2df] rounded-[10px] p-4 opacity-60">
            <div className="text-[13px] font-semibold text-[#1c1c1a] mb-1">More brokers — coming soon</div>
            <div className="text-[12px] text-[#aaa]">Upstox · Fyers · Angel One · ICICI Direct</div>
          </div>
        )}
      </div>
    </div>
  );
}
