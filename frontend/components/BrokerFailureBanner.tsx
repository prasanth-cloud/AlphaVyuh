"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlugZap } from "lucide-react";
import { getBrokerStatus } from "@/lib/api";

const DISMISS_KEY = "alphavyuh-broker-banner-dismissed";

export function BrokerFailureBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) return;
    getBrokerStatus()
      .then((s) => {
        if (!s.connected || s.token_expired) setShow(true);
      })
      .catch(() => null);
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    setShow(false);
    if (typeof window !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <div
      style={{
        background: "rgba(186,117,23,0.12)",
        border: "1px solid rgba(186,117,23,0.3)",
        borderRadius: 6,
        padding: "8px 16px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
      }}
    >
      <PlugZap size={16} style={{ color: "#BA7517", flexShrink: 0 }} />
      <span style={{ color: "var(--text-primary, #F1EFE8)", flex: 1 }}>
        Zerodha disconnected — charts showing EOD data.{" "}
        <Link
          href="/settings/broker"
          style={{ color: "#00D9A7", textDecoration: "none", fontWeight: 500 }}
        >
          Reconnect &rarr;
        </Link>
      </span>
      <button
        onClick={handleDismiss}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-tertiary, #A8A29E)",
          cursor: "pointer",
          padding: 4,
          fontSize: 16,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
