"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { connectZerodha } from "@/lib/api";

function BrokerCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const requestToken = params.get("request_token");
    if (!requestToken) {
      setStatus("error");
      setMessage("No request token received from Zerodha.");
      return;
    }

    connectZerodha(requestToken)
      .then(() => {
        setStatus("success");
        setMessage("Zerodha connected! Redirecting to settings…");
        setTimeout(() => router.replace("/settings?tab=profile&broker=connected"), 2000);
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
              style={{ borderColor: "#5b63f5", borderTopColor: "transparent" }} />
            <p className="text-[14px]" style={{ color: "var(--app-text2)" }}>Connecting Zerodha…</p>
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
              onClick={() => router.replace("/settings?tab=profile")}
              className="px-4 py-2 rounded-[8px] text-[13px] font-semibold text-white"
              style={{ background: "#5b63f5" }}>
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
          style={{ borderColor: "#5b63f5", borderTopColor: "transparent" }} />
      </div>
    }>
      <BrokerCallbackContent />
    </Suspense>
  );
}
