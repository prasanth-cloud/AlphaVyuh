"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { markAppTiming } from "@/lib/performance";
import { trackEvent } from "@/lib/analytics";
import { resolveAppRouteLabel } from "@/lib/workflow-placement";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]       = useState("");
  const [notice, setNotice]     = useState("");
  const [showResend, setShowResend] = useState(false);
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get("next");
    setNextPath(isSafeRedirect(requestedNext) ? requestedNext : "/dashboard");
    if (params.get("error") === "auth_callback_failed") {
      setError("Confirmation link expired or could not be verified. Please sign in, or request a fresh link.");
      setShowResend(true);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    markAppTiming("login-submit");
    setError("");
    setNotice("");
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
      markAppTiming("auth-session-set");
      trackEvent("login_success", { next_path: nextPath });
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    setError("");
    setNotice("");
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), next: nextPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not resend confirmation email.");
        return;
      }
      setNotice("If this account is waiting for verification, a fresh link has been sent.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(180deg, var(--accent-subtle), transparent), var(--surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: 16,
      boxShadow: "var(--shadow-panel)",
      padding: 32,
      width: "100%",
      backdropFilter: "blur(14px)",
    }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.035em", lineHeight: 1.05 }}>
          Sign in to AlphaVyuh
        </div>
        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
          Continue to your AlphaVyuh account.
        </div>
        {nextPath !== "/dashboard" && (
          <div
            style={{
              marginTop: 12,
              border: "1px solid var(--border-default)",
              borderRadius: 10,
              background: "var(--accent-subtle)",
              color: "var(--text-secondary)",
              fontSize: 12,
              padding: "8px 10px",
            }}
          >
            After sign-in, you will continue to <span style={{ color: "var(--text-primary)" }}>{resolveAppRouteLabel(nextPath)}</span>.
          </div>
        )}
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
        {notice && <p style={{ fontSize: 13, color: "var(--gain)" }}>{notice}</p>}
        {showResend && (
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={resending || !email}
            onClick={resendConfirmation}
            fullWidth
          >
            {resending ? "Sending..." : "Resend confirmation email"}
          </Button>
        )}

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
        <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} style={{ color: "var(--accent)" }}>Request access</Link>
      </p>
      <p style={{ marginTop: 14, textAlign: "center", fontSize: 11, lineHeight: 1.6, color: "var(--text-tertiary)" }}>
        EOD market data · Broker import only
      </p>
    </div>
  );
}
