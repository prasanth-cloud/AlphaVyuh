"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { connectBrokerCallback, connectZerodha } from "@/lib/api";

function BrokerCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const broker = params.get("broker") === "upstox" ? "upstox" : "zerodha";
    const requestToken = params.get("request_token") || params.get("code");
    if (!requestToken) {
      setStatus("error");
      setMessage("No authorization code received from broker.");
      return;
    }

    const connect = broker === "zerodha" && params.get("request_token")
      ? connectZerodha(requestToken)
      : connectBrokerCallback(broker, requestToken);

    connect
      .then((result) => {
        setStatus("success");
        const name = "broker_user_name" in result && result.broker_user_name ? ` as ${result.broker_user_name}` : "";
        setMessage(`${broker === "upstox" ? "Upstox" : "Zerodha"} connected${name}. Redirecting to settings...`);
        setTimeout(() => router.replace(`/settings/broker?connected=${broker}`), 2000);
      })
      .catch((e: Error) => {
        setStatus("error");
        setMessage(e.message || "Connection failed.");
      });
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
      <div className="rounded-[14px] p-8 max-w-sm w-full text-center"
        style={{ background: "var(--app-surface2)", border: "1px solid var(--app-border)" }}>
        {status === "loading" && (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
              style={{ borderColor: "#f4f7fb", borderTopColor: "transparent" }} />
            <p className="text-[14px]" style={{ color: "var(--app-text2)" }}>Connecting broker...</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-[28px] mx-auto mb-4"
              style={{ background: "rgba(38,166,91,0.15)" }}>✓</div>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--app-text1)" }}>Connected!</h2>
            <p className="text-[13px]" style={{ color: "var(--app-text3)" }}>{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-[28px] mx-auto mb-4"
              style={{ background: "rgba(229,56,59,0.15)" }}>✗</div>
            <h2 className="text-[18px] font-bold mb-1" style={{ color: "var(--app-text1)" }}>Connection failed</h2>
            <p className="text-[13px] mb-4" style={{ color: "var(--app-text3)" }}>{message}</p>
            <button
              onClick={() => router.replace("/settings/broker")}
              className="px-4 py-2 rounded-[8px] text-[13px] font-semibold"
              style={{ background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--text-on-accent)", border: "1px solid rgba(244,247,251,0.24)" }}>
              Back to Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function BrokerCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#f4f7fb", borderTopColor: "transparent" }} />
      </div>
    }>
      <BrokerCallbackContent />
    </Suspense>
  );
}
