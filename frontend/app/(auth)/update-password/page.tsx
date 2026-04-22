"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <div className="auth-kicker">Done</div>
          <CardTitle>Password updated</CardTitle>
          <CardDescription>Your new password is set. Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button variant="primary" size="lg" fullWidth>Go to login</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="auth-kicker">Recovery</div>
        <div style={{ fontSize: 30, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 8 }}>
          Set a new password
        </div>
        <CardDescription>Choose a strong password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 8 characters" required minLength={8} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password" required />
          </div>
          {error && <p style={{ fontSize: 13, color: "var(--loss)" }}>{error}</p>}
          <Button type="submit" disabled={loading || !password || !confirm} variant="primary" size="lg" fullWidth>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
