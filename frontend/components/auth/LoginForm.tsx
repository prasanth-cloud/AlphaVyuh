"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Label } from "@/components/ui";
import { isSafeRedirect } from "@/lib/safe-redirect";

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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(isSafeRedirect(next) ? next! : "/dashboard");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02)), rgba(10,14,18,0.88)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 24,
      boxShadow: "var(--shadow-panel)",
      padding: 32,
      width: "100%",
      backdropFilter: "blur(14px)",
    }}>
      <div style={{ marginBottom: 28 }}>
        <div className="auth-kicker">Member Access</div>
        <div style={{ fontSize: 30, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
          Sign in to AlphaVyuh
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
          Continue into your trading workspace and pick up exactly where your workflow left off.
        </div>
      </div>

      <form onSubmit={handleLogin} style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" required autoFocus
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Label htmlFor="password">Password</Label>
            <Link href="/reset-password" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Forgot password?
            </Link>
          </div>
          <Input
            id="password" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your password" required
          />
        </div>

        {error && <p style={{ fontSize: 13, color: "var(--loss)" }}>{error}</p>}

        <Button
          type="submit" disabled={loading || !email || !password}
          variant="primary"
          size="lg"
          fullWidth
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p style={{ marginTop: 22, textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "var(--accent)" }}>Create one</Link>
      </p>
    </div>
  );
}
