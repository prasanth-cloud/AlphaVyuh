"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { markAppTiming } from "@/lib/performance";
import { trackEvent } from "@/lib/analytics";
import { resolveAppRouteLabel } from "@/lib/workflow-placement";
import { Eye, EyeOff } from "lucide-react";

const LAST_LOGIN_EMAIL_KEY = "alphavyuh-last-login-email";

function normalizeLoginEmail(value: string) {
  return value.trim().toLowerCase();
}

function readLastLoginEmail() {
  try {
    return window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLastLoginEmail(value: string) {
  try {
    window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, value);
  } catch {
    // Remembering the email is only a convenience.
  }
}

function clearLastLoginEmail() {
  try {
    window.localStorage.removeItem(LAST_LOGIN_EMAIL_KEY);
  } catch {
    // Remembering the email is only a convenience.
  }
}

export default function LoginForm() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]       = useState("");
  const [notice, setNotice]     = useState("");
  const [showResend, setShowResend] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [nextPath, setNextPath] = useState("/dashboard");
  const [rememberedEmail, setRememberedEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get("next");
    const safeNextPath = isSafeRedirect(requestedNext) ? requestedNext : "/dashboard";
    setNextPath(safeNextPath);
    router.prefetch(safeNextPath);
    const rememberedEmail = readLastLoginEmail();
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberedEmail(rememberedEmail);
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    }
    if (params.get("error") === "auth_callback_failed") {
      setError("Confirmation link expired or could not be verified. Please sign in, or request a fresh link.");
      setShowResend(true);
    }
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    markAppTiming("login-submit");
    setError("");
    setNotice("");
    setLoading(true);
    const normalizedEmail = normalizeLoginEmail(email);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      writeLastLoginEmail(normalizedEmail);
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
    const normalizedEmail = normalizeLoginEmail(email);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, next: nextPath }),
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

  function useAnotherAccount() {
    clearLastLoginEmail();
    setRememberedEmail("");
    setEmail("");
    setPassword("");
    setError("");
    setNotice("");
    window.requestAnimationFrame(() => emailRef.current?.focus());
  }

  const showPasswordRecovery = /password|credentials/i.test(error) && !/temporarily unavailable/i.test(error);

  return (
    <div style={{
      background: "linear-gradient(180deg, var(--accent-subtle), transparent), var(--surface-1)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      boxShadow: "var(--shadow-panel)",
      padding: 24,
      width: "100%",
      backdropFilter: "blur(14px)",
    }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: 0, lineHeight: 1.15, margin: 0 }}>
          Sign in
        </h1>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.55 }}>
          Continue to your trading desk.
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
            ref={emailRef}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => setEmail((value) => normalizeLoginEmail(value))}
            placeholder="you@example.com" required autoFocus
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            enterKeyHint="next"
          />
          {rememberedEmail && email === rememberedEmail && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--text-tertiary)" }}>
                Remembered email
              </span>
              <button
                type="button"
                onClick={useAnotherAccount}
                style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
              >
                Use another account
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Label htmlFor="password">Password</Label>
            <Link href="/reset-password" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Forgot password?
            </Link>
          </div>
          <div style={{ position: "relative" }}>
            <Input
              id="password" type={showPass ? "text" : "password"} value={password}
              ref={passwordRef}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password" required
              autoComplete="current-password"
              enterKeyHint="go"
              style={{ paddingRight: 42 }}
            />
            <button
              type="button"
              aria-label={showPass ? "Hide password" : "Show password"}
              title={showPass ? "Hide password" : "Show password"}
              onClick={() => setShowPass((s) => !s)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                display: "inline-flex",
              }}
            >
              {showPass ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ display: "grid", gap: 8 }}>
            <p style={{ fontSize: 13, color: "var(--loss)", margin: 0 }}>{error}</p>
            {showPasswordRecovery && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                <Link href="/reset-password" style={{ color: "var(--accent)", fontWeight: 600 }}>
                  Reset password
                </Link>
                <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} style={{ color: "var(--text-secondary)" }}>
                  Request access
                </Link>
              </div>
            )}
          </div>
        )}
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
          {loading ? "Signing in..." : "Continue"}
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
