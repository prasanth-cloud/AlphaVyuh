"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrokerStatus } from "@/lib/api";

export default function BrokerSettingsPage() {
  const [connected, setConnected] = useState(false);
  const [broker, setBroker] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBrokerStatus()
      .then(s => {
        setConnected(s.connected);
        setBroker(s.broker);
        setConnectedAt(s.connected_at);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#f2f2f0]">
      <div className="max-w-[700px] mx-auto px-5 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] text-[#aaa] mb-6">
          <Link href="/settings" className="hover:text-[#1c1c1a] transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-[#1c1c1a] font-medium">Broker connection</span>
        </div>

        <div className="mb-6">
          <div className="text-[20px] font-semibold text-[#1c1c1a]">Broker connection</div>
          <div className="text-[13px] text-[#888] mt-1">
            Connect your broker to trade directly from charts and auto-import trades into your journal.
          </div>
        </div>

        {/* Connection status */}
        {!loading && connected && (
          <div className="flex items-center gap-2.5 bg-[#edfaf3] border border-[#26a65b33] rounded-[10px] px-4 py-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-[#26a65b]" />
            <span className="text-[13px] font-semibold text-[#26a65b] capitalize">{broker} connected</span>
            {connectedAt && (
              <span className="text-[11px] text-[#888] ml-1">
                · since {new Date(connectedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        )}

        {/* Zerodha card */}
        <div className="bg-white border border-[#e2e2df] rounded-[10px] p-6 mb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-[#1c1c1a] mb-1">Zerodha Kite</div>
              <div className="text-[13px] text-[#888] mb-4">
                India&apos;s largest stockbroker. Connect to place orders and auto-import trades.
              </div>
              <div className="flex flex-col gap-2">
                {[
                  "Place Market, Limit, SL orders directly from the chart",
                  "Auto-import today's filled trades into your journal",
                  "Real-time order status and P&L tracking",
                ].map(feat => (
                  <div key={feat} className="flex items-center gap-2 text-[12px] text-[#555]">
                    <div className="w-4 h-4 bg-[#edfaf3] rounded-full flex items-center justify-center flex-shrink-0 text-[#26a65b] text-[10px] font-bold">✓</div>
                    {feat}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-shrink-0 mt-1">
              <Link
                href="/settings?tab=profile"
                className="inline-block px-4 py-2 rounded-[8px] text-[13px] font-semibold text-white bg-[#5b63f5] hover:opacity-85 transition-opacity"
              >
                {connected && broker === "zerodha" ? "Reconnect" : "Set up"}
              </Link>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#f0f0ee]">
            <div className="text-[11px] text-[#aaa] font-medium uppercase tracking-wider mb-2">Setup guide</div>
            <ol className="space-y-1.5 text-[12px] text-[#888]">
              <li className="flex gap-2"><span className="text-[#5b63f5] font-semibold">1.</span> Go to Settings → Profile tab → Broker Connection</li>
              <li className="flex gap-2"><span className="text-[#5b63f5] font-semibold">2.</span> Select Zerodha, enter your API key and secret from developers.kite.trade</li>
              <li className="flex gap-2"><span className="text-[#5b63f5] font-semibold">3.</span> Click &quot;Connect Zerodha →&quot; to authorise via Kite login</li>
              <li className="flex gap-2"><span className="text-[#5b63f5] font-semibold">4.</span> You&apos;ll be redirected back — connection complete</li>
            </ol>
          </div>
        </div>

        {/* Coming soon brokers */}
        <div className="bg-white border border-[#e2e2df] rounded-[10px] p-4 opacity-60">
          <div className="text-[13px] font-semibold text-[#1c1c1a] mb-1">More brokers — coming soon</div>
          <div className="text-[12px] text-[#aaa]">Upstox · Fyers · Angel One · ICICI Direct</div>
        </div>
      </div>
    </div>
  );
}
