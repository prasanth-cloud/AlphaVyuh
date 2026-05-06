"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function DevLoginInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    const email = params.get("email");
    const token = params.get("token");
    if (!email || !token) {
      setStatus("Missing email or token in URL.");
      return;
    }
    const supabase = createClient();
    supabase.auth
      .verifyOtp({ email, token, type: "email" })
      .then(({ error }) => {
        if (error) {
          setStatus("Token invalid or expired — generate a fresh one.");
        } else {
          window.location.replace("/dashboard");
        }
      });
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)", color: "var(--app-text1)" }}>
      <div
        className="rounded-[14px] border px-8 py-6 text-center shadow-sm"
        style={{ background: "var(--app-surface1)", borderColor: "var(--app-border)" }}
      >
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
          style={{ borderColor: "var(--app-accent)", borderTopColor: "transparent" }} />
        <p className="text-[14px]" style={{ color: "var(--app-text2)" }}>{status}</p>
      </div>
    </div>
  );
}

export default function DevLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--app-accent)", borderTopColor: "transparent" }} />
      </div>
    }>
      <DevLoginInner />
    </Suspense>
  );
}
