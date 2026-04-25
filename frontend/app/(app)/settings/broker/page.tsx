"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getBrokerStatus,
  getZerodhaLoginUrl,
  importZerodhaTrades,
} from "@/lib/api";

type BrokerState = Awaited<ReturnType<typeof getBrokerStatus>>;

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
      const next = await getBrokerStatus();
      setState(next);
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
      setToast("Broker connected. Orders placed from charts now route live when the token is valid.");
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div
          className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-[720px] mx-auto px-5 py-8">
        <div className="flex items-center gap-2 text-[12px] mb-6" style={{ color: "var(--text-tertiary)" }}>
          <Link href="/settings" className="hover:opacity-80" style={{ color: "var(--text-secondary)" }}>
            Settings
          </Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Broker execution</span>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div className="text-[22px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Broker execution
          </div>
          <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)", maxWidth: 560 }}>
            Keep this flow simple: save your Zerodha API key and secret in settings, connect once per token cycle, then place live orders from charts. If the broker is not connected, AlphaVyuh stays in simulated mode and still journals the trade.
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
            <div>
              <div className="text-[12px] uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)", marginBottom: 8 }}>
                Current mode
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <StatusDot tone={mode === "live" ? "live" : mode === "token-expired" ? "warning" : "simulated"} />
                <div className="text-[16px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {mode === "live"
                    ? "Live execution via Zerodha"
                    : mode === "token-expired"
                      ? "Token expired — reconnect required"
                      : mode === "credentials-missing"
                        ? "Credentials missing"
                        : "Simulated execution"}
                </div>
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {mode === "live"
                  ? "Orders from chart and watchlist route live, then auto-record into the journal."
                  : mode === "token-expired"
                    ? "Your API key is saved, but the access token is no longer valid. Reconnect and you are back to live mode."
                    : mode === "credentials-missing"
                      ? "Save your Zerodha API key and secret first, then start the OAuth connect flow."
                      : "Orders still work in simulated mode so you can test the full scan → chart → journal workflow."}
              </div>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border-subtle)",
                background: "var(--surface-2)",
              }}
            >
              {state?.connected_at ? `Connected ${new Date(state.connected_at).toLocaleDateString()}` : "No live session"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>API key</div>
              <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {state?.has_api_key ? "Saved" : "Missing"}
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>Access token</div>
              <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {state?.connected ? "Valid" : state?.has_token ? "Stored" : "Missing"}
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)", marginBottom: 4 }}>Execution mode</div>
              <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>
                {state?.mode ?? "simulated"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              onClick={handleConnect}
              disabled={busy === "connect" || !state?.has_api_key}
              className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
            >
              {busy === "connect"
                ? "Opening Kite…"
                : mode === "live"
                  ? "Reconnect Zerodha"
                  : "Connect Zerodha"}
            </button>

            <button
              onClick={handleImport}
              disabled={busy === "import" || !state?.connected}
              className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
              style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
            >
              {busy === "import" ? "Importing…" : "Import today’s filled trades"}
            </button>

            <Link
              href="/settings?tab=broker"
              className="px-4 py-2.5 rounded-[10px] text-[13px] font-semibold"
              style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
            >
              Edit broker credentials
            </Link>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)", marginBottom: 10 }}>
            Simplest operating model
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              "1. Save your Zerodha API key and secret in Settings.",
              "2. Connect Zerodha here to get a valid access token.",
              "3. Place orders from chart or watchlist. AlphaVyuh journals every trade either way.",
              "4. Use Import when you want today’s filled Zerodha orders pulled into the journal.",
            ].map((line) => (
              <div key={line} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {(toast || error) && (
          <div
            style={{
              ...cardStyle,
              padding: 14,
              color: error ? "var(--loss)" : "var(--text-primary)",
              background: error ? "rgba(255, 90, 101, 0.08)" : "var(--surface-1)",
            }}
          >
            <div className="text-[12px]">{error || toast}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrokerSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
          <div
            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
        </div>
      }
    >
      <BrokerSettingsContent />
    </Suspense>
  );
}
