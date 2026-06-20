"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { getKiteTokenHealth } from "@/lib/api";

export default function KiteTokenBanner() {
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getKiteTokenHealth()
      .then((h) => {
        if (!cancelled && h.connected && h.needs_reconnect) {
          setNeedsReconnect(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!needsReconnect || dismissed) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-[12px]"
      style={{ background: "var(--loss)", color: "white" }}
      data-testid="kite-token-banner"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={13} />
        <span>Kite session expired — reconnect to resume broker features.</span>
        <Link href="/settings?tab=broker" className="underline font-semibold">
          Reconnect
        </Link>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={13} />
      </button>
    </div>
  );
}
