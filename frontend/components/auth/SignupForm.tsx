"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

export default function SignupForm() {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nextPath, setNextPath] = useState("/onboarding");

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    setNextPath(isSafeRedirect(next) ? next : "/onboarding");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          full_name: form.full_name,
          next: nextPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.toLowerCase().includes("already")) {
          setError("Email already in use. Please log in instead.");
        } else {
          setError(data.error || "Signup failed");
        }
        return;
      }
      if (data.pending_confirmation) {
        setDone(true);
        return;
      }
      window.location.replace(nextPath);
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
        body: JSON.stringify({ email: form.email.trim().toLowerCase(), next: nextPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not resend confirmation email.");
        return;
      }
      setNotice("A fresh confirmation link has been sent.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setResending(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <div className="auth-kicker">Verification</div>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to <strong style={{ color: "var(--text-primary)" }}>{form.email}</strong>.
            Click it to activate your account and continue into your AlphaVyuh workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)" }}>
            Keep this tab open if you want. After verification, the link signs you in and redirects you to your account automatically.
          </p>
          {notice && <p style={{ marginTop: 12, fontSize: 13, color: "var(--gain)" }}>{notice}</p>}
          {error && <p style={{ marginTop: 12, fontSize: 13, color: "var(--loss)" }}>{error}</p>}
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            disabled={resending}
            onClick={resendConfirmation}
            style={{ marginTop: 16 }}
          >
            {resending ? "Sending..." : "Resend confirmation email"}
          </Button>
          <p style={{ marginTop: 14, fontSize: 13, color: "var(--text-tertiary)" }}>
            Already verified?{" "}
            <Link href="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="auth-kicker">New Account</div>
        <div style={{ marginBottom: 10, fontSize: 30, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
          Create your account
        </div>
        <CardDescription>Start your free trading edge in the same workspace you saw on the landing page.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" value={form.full_name} onChange={set("full_name")}
              placeholder="Arjun Sharma" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")}
              placeholder="arjun@example.com" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPass ? "text" : "password"} value={form.password}
                onChange={set("password")} placeholder="Min 8 characters" required minLength={8} />
              <button type="button" onClick={() => setShowPass((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-tertiary)" }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type={showPass ? "text" : "password"} value={form.confirm}
              onChange={set("confirm")} placeholder="Repeat password" required />
          </div>

          {error && <p style={{ fontSize: 13, color: "var(--loss)" }}>{error}</p>}

          <Button type="submit" disabled={loading} variant="primary" size="lg" fullWidth>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(nextPath)}`} style={{ color: "var(--accent)" }}>Log in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
