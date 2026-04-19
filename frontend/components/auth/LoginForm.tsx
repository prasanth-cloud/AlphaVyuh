"use client";

import { useState } from "react";
import Link from "next/link";

const SUPA_URL = "https://fyxltykqdvacbdgmeucf.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5eGx0eWtxZHZhY2JkZ21ldWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjU5ODcsImV4cCI6MjA5MTcwMTk4N30.ql5GQNBNaVJvnFwQMXMiVuJ9OuvZcERSWVLR929qG1U";

export default function LoginForm() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPA_KEY,
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error_description || data.msg || data.message || "Login failed");
        return;
      }
      // Store session tokens so Supabase client picks them up
      const storageKey = `sb-fyxltykqdvacbdgmeucf-auth-token`;
      const session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        expires_in: data.expires_in,
        token_type: data.token_type,
        user: data.user,
      };
      localStorage.setItem(storageKey, JSON.stringify(session));
      window.location.replace("/dashboard");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-[14px] shadow-sm border border-[#e2e2df] p-8 w-full">
      <div className="mb-6">
        <div className="text-[22px] font-bold text-[#1c1c1a] tracking-tight">AlphaVyuh</div>
        <div className="text-[13px] text-[#888] mt-0.5">Sign in to your account</div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[12px] font-semibold text-[#555] uppercase tracking-wide">
            Email
          </label>
          <input
            id="email" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" required autoFocus
            className="w-full text-[14px] border border-[#e2e2df] rounded-[8px] px-3 py-2.5 outline-none focus:border-[#5b63f5] focus:ring-1 focus:ring-[#5b63f5]/30 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-[12px] font-semibold text-[#555] uppercase tracking-wide">
            Password
          </label>
          <input
            id="password" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your password" required
            className="w-full text-[14px] border border-[#e2e2df] rounded-[8px] px-3 py-2.5 outline-none focus:border-[#5b63f5] focus:ring-1 focus:ring-[#5b63f5]/30 transition-colors"
          />
        </div>

        {error && <p className="text-[13px] text-[#e5383b]">{error}</p>}

        <button
          type="submit" disabled={loading || !email || !password}
          className="w-full py-2.5 rounded-[8px] text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
          style={{ background: "#5b63f5" }}
        >
          {loading ? "Signing in…" : "Sign in →"}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px] text-[#888]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[#5b63f5] hover:underline">Sign up</Link>
      </p>
    </div>
  );
}
