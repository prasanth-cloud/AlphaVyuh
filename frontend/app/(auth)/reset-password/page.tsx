"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <div className="auth-kicker">Recovery</div>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            If that email exists, you&apos;ll receive a reset link shortly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" style={{ color: "var(--accent)", fontSize: 13 }}>
            Back to login
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="auth-kicker">Recovery</div>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send a reset link back to AlphaVyuh.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="arjun@example.com" required
            />
          </div>
          <Button type="submit" disabled={loading} variant="primary" size="lg" fullWidth>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
          <Link href="/login" style={{ color: "var(--accent)" }}>Back to login</Link>
        </p>
      </CardContent>
    </Card>
  );
}
