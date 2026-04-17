"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Step = "email" | "otp";

export default function LoginForm() {
  const [step, setStep]       = useState<Step>("email");
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState(["", "", "", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) {
      setError(err.message.includes("not found") || err.message.includes("not registered")
        ? "No account found with this email. Please sign up first."
        : err.message);
      return;
    }
    setStep("otp");
    setResendTimer(30);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const token = otp.join("");
    if (token.length < 8) { setError("Please enter the 8-digit code."); return; }
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    setLoading(false);
    if (err) {
      setError("Invalid or expired code. Please try again.");
      setOtp(["", "", "", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }
    window.location.replace("/dashboard");
  }

  async function resendOtp() {
    if (resendTimer > 0) return;
    setError("");
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setLoading(false);
    setOtp(["", "", "", "", "", "", "", ""]);
    setResendTimer(30);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }

  function handleOtpChange(index: number, value: string) {
    // Allow paste of full 6-digit code
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 8).split("");
      const next = [...otp];
      digits.forEach((d, i) => { if (index + i < 6) next[index + i] = d; });
      setOtp(next);
      const focusIdx = Math.min(index + digits.length, 7);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 7) inputRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <div className="mb-2 text-2xl font-bold text-white tracking-tight">AlphaVyuh</div>
        <CardTitle className="text-white">
          {step === "email" ? "Welcome back" : "Check your email"}
        </CardTitle>
        <CardDescription className="text-gray-400">
          {step === "email"
            ? "Enter your email to receive a one-time login code"
            : `We sent an 8-digit code to ${email}`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === "email" ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <Input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="arjun@example.com" required autoFocus
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">
              {loading ? "Sending…" : "Send OTP →"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-5">
            {/* 6-digit OTP boxes */}
            <div className="flex justify-center gap-2">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={6}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-xl font-bold rounded-lg border bg-gray-800 border-gray-600 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              ))}
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <Button type="submit" disabled={loading || otp.join("").length < 8}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">
              {loading ? "Verifying…" : "Verify & Log in"}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => { setStep("email"); setError(""); setOtp(["", "", "", "", "", ""]); }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={resendOtp}
                disabled={resendTimer > 0 || loading}
                className="text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300">Sign up</Link>
        </p>
      </CardContent>
    </Card>
  );
}
