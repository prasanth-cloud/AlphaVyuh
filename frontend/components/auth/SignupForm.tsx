"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
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
      window.location.replace("/dashboard");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Check your email</CardTitle>
          <CardDescription className="text-gray-400">
            We sent a confirmation link to <strong className="text-white">{form.email}</strong>.
            Click it to activate your account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <div className="mb-2 text-2xl font-bold text-white tracking-tight">AlphaVyuh</div>
        <CardTitle className="text-white">Create your account</CardTitle>
        <CardDescription className="text-gray-400">Start your free trading edge today</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="full_name" className="text-gray-300">Full name</Label>
            <Input id="full_name" value={form.full_name} onChange={set("full_name")}
              placeholder="Arjun Sharma" required
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email" className="text-gray-300">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={set("email")}
              placeholder="arjun@example.com" required
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-gray-300">Password</Label>
            <div className="relative">
              <Input id="password" type={showPass ? "text" : "password"} value={form.password}
                onChange={set("password")} placeholder="Min 8 characters" required minLength={8}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pr-10" />
              <button type="button" onClick={() => setShowPass((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm" className="text-gray-300">Confirm password</Label>
            <Input id="confirm" type={showPass ? "text" : "password"} value={form.confirm}
              onChange={set("confirm")} placeholder="Repeat password" required
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Log in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
