"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSafeRedirect } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

export default function SignupForm() {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.full_name } },
    });
    setLoading(false);

    if (err) {
      if (err.message.toLowerCase().includes("already")) {
        setError("Email already in use. Please log in instead.");
      } else {
        setError(err.message);
      }
      return;
    }

    // If email confirmation is disabled, Supabase returns a session immediately
    if (data.session) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(isSafeRedirect(next) ? next : "/dashboard");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <div className="auth-kicker">Verification</div>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to <strong style={{ color: "var(--text-primary)" }}>{form.email}</strong>.
            Click it to activate your account.
          </CardDescription>
        </CardHeader>
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
          <Link href="/login" style={{ color: "var(--accent)" }}>Log in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
