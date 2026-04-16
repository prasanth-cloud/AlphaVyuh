"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { connectZerodha } from "@/lib/api";

export default function BrokerCallbackPage() {
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
    <div className="min-h-screen bg-[#f2f2f0] flex items-center justify-center">
      <div className="bg-white rounded-[14px] shadow-sm border border-[#e2e2df] p-8 max-w-sm w-full text-center">
        {status === "loading" && (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-[14px] text-[#444]">Connecting Zerodha…</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#edfaf3] flex items-center justify-center text-[28px] mx-auto mb-4">✓</div>
            <h2 className="text-[18px] font-bold text-[#1c1c1a] mb-1">Connected!</h2>
            <p className="text-[13px] text-[#888]">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-14 h-14 rounded-full bg-[#fff0f0] flex items-center justify-center text-[28px] mx-auto mb-4">✗</div>
            <h2 className="text-[18px] font-bold text-[#1c1c1a] mb-1">Connection failed</h2>
            <p className="text-[13px] text-[#888] mb-4">{message}</p>
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
