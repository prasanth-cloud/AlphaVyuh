"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function DevLoginPage() {
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
    <div className="min-h-screen bg-[#f2f2f0] flex items-center justify-center">
      <div className="bg-white rounded-[14px] border border-[#e2e2df] px-8 py-6 text-center shadow-sm">
        <div className="w-6 h-6 rounded-full border-2 border-[#5b63f5] border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-[14px] text-[#555]">{status}</p>
      </div>
    </div>
  );
}
